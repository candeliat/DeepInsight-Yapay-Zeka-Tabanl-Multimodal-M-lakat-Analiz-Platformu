"""
Ön yazı (motivasyon mektubu) üretici: kullanıcının bir ilanı ve analiz edilmiş CV'si.

- LLM yalnızca gövde paragraflarını yazar; hitap, kapanış ve imza koddan eklenir.
  İletişim bilgisi modele gönderilmez (CV alanları ats_service.mask_contact'tan
  geçer), ad yalnızca imzaya kodla yazılır.
- Dürüstlük denetimi deterministiktir: mektupta CV'de geçmeyen bir sayı/yüzde ya da
  ilanın isteyip CV'de görünmeyen bir beceri varsa kullanıcıya uyarı döner
  (LLM'in "uydurma" demesine güvenilmez).
- Kaydedilmez: kullanıcı metni düzenleyip kopyalar. Sahiplik: ilan ve CV kullanıcıya ait olmalı.
"""
import logging
import re
from typing import Any, Dict, List, Optional

from app.services import ats_service, cv_service, job_service, skill_matching
from app.services.job_service import _safe, _str_list
from app.services.llm_service import llm_service
from app.services.prompts.cover_letter_v1 import build_cover_letter_prompt, build_cover_letter_user_message

logger = logging.getLogger(__name__)

LANGUAGES = {"tr", "en"}
TONES = {"resmi", "samimi"}
MAX_NOTE = 500

_GREETING = {"tr": "Sayın İşe Alım Ekibi,", "en": "Dear Hiring Team,"}
_CLOSING = {"tr": "Saygılarımla,", "en": "Kind regards,"}
_NAME_PLACEHOLDER = {"tr": "[Adınız Soyadınız]", "en": "[Your Name]"}
# "40", "%40", "40%", "3,5", "2.000" — tarihler (yıl) de sayı sayılır; CV'de geçiyorsa sorun değil.
_NUMBER_RE = re.compile(r"%?\d+(?:[.,]\d+)*%?")
_THOUSANDS_RE = re.compile(r"^\d{1,3}(?:[.,]\d{3})+$")
# "30 bin", "2,5 milyon", "30k": CV'de böyle yazılan sayı mektupta "30.000" olabilir.
_SCALED_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(bin|k|milyon|million|m)\b", re.IGNORECASE)
_SCALE = {"bin": 1_000, "k": 1_000, "milyon": 1_000_000, "million": 1_000_000, "m": 1_000_000}


def _clip(v: Any, n: int) -> str:
    return _safe(" ".join(str(v or "").split()), n)


def build_cv_facts(profile: Dict[str, Any]) -> str:
    """Modele giden CV özeti: ad ve iletişim yok; her alan kısaltılır ve maskelenir."""
    lines: List[str] = []
    if profile.get("summary"):
        lines.append(f"Özet: {_clip(profile['summary'], 500)}")
    if profile.get("seniority"):
        lines.append(f"Seviye: {_clip(profile['seniority'], 20)}")
    skills = [_clip(s, 40) for s in skill_matching.cv_skill_list(profile)[:25]]
    if skills:
        lines.append("Beceriler: " + ", ".join(dict.fromkeys(skills)))
    for e in (profile.get("experience") or [])[:4]:
        if not isinstance(e, dict):
            continue
        period = " - ".join(x for x in (_clip(e.get("start"), 20), _clip(e.get("end"), 20)) if x)
        head = " · ".join(x for x in (_clip(e.get("title"), 80), _clip(e.get("company"), 80), period) if x)
        bullets = "; ".join(_clip(b, 200) for b in (e.get("bullets") or [])[:3])
        lines.append(f"Deneyim: {head}" + (f" — {bullets}" if bullets else ""))
    for p in (profile.get("projects") or [])[:4]:
        if not isinstance(p, dict):
            continue
        tech = ", ".join(_clip(t, 30) for t in (p.get("tech") or [])[:6])
        lines.append(f"Proje: {_clip(p.get('name'), 80)} — {_clip(p.get('description'), 250)}" + (f" ({tech})" if tech else ""))
    for ed in (profile.get("education") or [])[:2]:
        if not isinstance(ed, dict):
            continue
        lines.append("Eğitim: " + " · ".join(x for x in (_clip(ed.get("school"), 100), _clip(ed.get("degree"), 60),
                                                          _clip(ed.get("field"), 80), _clip(ed.get("end"), 20)) if x))
    for key, label in (("languages", "Diller"), ("certifications", "Sertifikalar")):
        items = [_clip(x, 60) for x in (profile.get(key) or [])[:6]]
        if items:
            lines.append(f"{label}: " + ", ".join(items))
    return "\n".join(lines)[:4000]


def build_job_facts(job: Dict[str, Any]) -> str:
    reqs = job.get("requirements") or {}
    lines = [f"Pozisyon: {_clip(job.get('title') or reqs.get('title') or 'Belirtilmemiş', 150)}"]
    company = job.get("company") or reqs.get("company")
    if company:
        lines.append(f"Şirket: {_clip(company, 100)}")
    for key, label in (("required_skills", "Zorunlu"), ("nice_to_have_skills", "Tercihen"), ("responsibilities", "Sorumluluklar")):
        items = [_clip(x, 160) for x in (reqs.get(key) or [])[:10]]
        if items:
            lines.append(f"{label}: " + "; ".join(items))
    return "\n".join(lines)[:2500]


def _norm_number(token: str) -> str:
    n = token.strip("%")
    if _THOUSANDS_RE.match(n):  # 30.000 / 30,000 -> 30000
        return re.sub(r"[.,]", "", n)
    n = n.replace(",", ".")
    return n[:-2] if n.endswith(".0") else n


def _numbers(text: str) -> set:
    found = {_norm_number(n) for n in _NUMBER_RE.findall(text or "")}
    for value, unit in _SCALED_RE.findall(text or ""):
        scaled = float(value.replace(",", ".")) * _SCALE[unit.lower()]
        found.add(str(int(scaled)) if scaled.is_integer() else str(scaled))
    return found


def honesty_warnings(letter: str, cv_text: str, profile: Dict[str, Any], missing: List[str]) -> List[str]:
    """Mektupta CV'de dayanağı olmayan sayılar ve CV'de görünmeyen ilan becerileri."""
    warnings: List[str] = []
    known = _numbers(cv_text) | _numbers(build_cv_facts(profile))
    unknown = sorted(n for n in _numbers(letter) if n not in known)
    if unknown:
        warnings.append(
            "CV'nizde geçmeyen sayılar var: " + ", ".join(unknown[:6])
            + ". Doğru değilse göndermeden önce düzeltin ya da çıkarın."
        )
    folded = ats_service.fold(letter)
    # Kısa adlar (Go, C#) _in_text'e takılmaz; kelime kümesinde anahtar olarak aranır.
    tokens = set(re.findall(r"[^\s,.;:!?()\"']+", folded))
    mentioned = [s for s in missing if skill_matching._in_text(s, folded) or skill_matching.skill_key(s) in tokens]
    if mentioned:
        warnings.append(
            "CV'nizde görünmeyen şu beceriler mektupta geçiyor: " + ", ".join(mentioned[:6])
            + ". Deneyiminiz yoksa bunların yalnızca öğrenmeye açık olduğunuz şekilde anıldığını kontrol edin."
        )
    return warnings


def assemble(paragraphs: List[str], language: str, name: Optional[str]) -> str:
    signature = (name or "").strip() or _NAME_PLACEHOLDER[language]
    return "\n\n".join([_GREETING[language], *paragraphs, f"{_CLOSING[language]}\n{signature}"])


async def generate(user_id: str, job_id: str, cv_id: str, language: str = "tr", tone: str = "resmi",
                   note: Optional[str] = None) -> Dict[str, Any]:
    if language not in LANGUAGES or tone not in TONES:
        raise ValueError("Geçersiz dil ya da ton")
    job = await job_service.get_job(user_id, job_id)
    if not job:
        raise LookupError("İlan bulunamadı")
    cv = await cv_service.get_cv(user_id, cv_id)
    if not cv:
        raise LookupError("CV bulunamadı")
    profile = cv.get("profile")
    if not profile:
        raise PermissionError("Bu CV henüz analiz edilmemiş. Önce CV analizini çalıştırın.")

    cv_text = cv.get("extracted_text") or ""
    match = skill_matching.compute_match(job.get("requirements") or {}, profile, cv_text)
    matched = [i["skill"] for i in match["required"] + match["nice_to_have"] if i["status"] != "missing"]
    missing = match["missing_required"] + match["missing_nice"]

    raw = await llm_service.generate_json(
        build_cover_letter_prompt(language, tone),
        build_cover_letter_user_message(
            build_job_facts(job), build_cv_facts(profile),
            [_clip(s, 40) for s in matched[:12]], [_clip(s, 40) for s in missing[:10]],
            _clip(note, MAX_NOTE),
        ),
        purpose="cover_letter",
        # Reasoning modeli (gpt-oss-20b) düşünmeye de bu paydan harcıyor; 3000'de canlıda
        # finish_reason=length ile boş döndü.
        max_tokens=6000,
        temperature=0.5,
    )
    paragraphs = [ats_service.mask_contact(p) for p in _str_list(raw.get("paragraphs"), 5, max_len=1500)]
    if len(paragraphs) < 2:
        raise RuntimeError("Model geçerli bir ön yazı döndürmedi")

    body = assemble(paragraphs, language, profile.get("full_name"))
    cv_keys = {skill_matching.skill_key(s) for s in skill_matching.cv_skill_list(profile)}
    highlighted = [s for s in _str_list(raw.get("highlighted_skills"), 5) if skill_matching.skill_key(s) in cv_keys]
    subject = _clip(raw.get("subject"), 150) or (
        f"{_clip(job.get('title'), 100)} pozisyonu için başvuru" if language == "tr" else f"Application for {_clip(job.get('title'), 100)}"
    )
    return {
        "subject": subject,
        "body": body,
        "language": language,
        "tone": tone,
        "highlighted_skills": highlighted,
        "warnings": honesty_warnings("\n".join(paragraphs), cv_text, profile, missing),
        "word_count": len(body.split()),
    }
