"""
CV analizi: (1) deterministik ATS skoru (her zaman), (2) LLM ile yapılandırılmış
profil + içerik önerileri (best-effort). LLM çökerse analiz yine ATS skoruyla
döner — `profile_error` alanı arayüze durumu bildirir.

Veri minimizasyonu: LLM'e gönderilen metinde e-posta/telefon maskelenir ve
açı parantezleri temizlenir (prompt'taki etiket sınırlarının kırılmasını önler).
"""
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.database import supabase
from app.services import ats_service, cv_service
from app.services.llm_service import llm_service
from app.services.prompts.cv_v1 import build_cv_profile_prompt, build_cv_user_message

logger = logging.getLogger(__name__)

MAX_LLM_CV_CHARS = 12_000


def _str_list(v: Any, limit: int) -> List[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip()[:200] for x in v if isinstance(x, (str, int, float)) and str(x).strip()][:limit]


def _dict_list(v: Any, limit: int) -> List[dict]:
    return [x for x in v if isinstance(x, dict)][:limit] if isinstance(v, list) else []


class CVProfile(BaseModel):
    """LLM çıktısının toleranslı şeması: bozuk/eksik alanlar varsayılana düşer, reddedilmez."""
    model_config = ConfigDict(extra="ignore")

    full_name: Optional[str] = None
    email: Optional[str] = None      # LLM'den değil, regex'ten doldurulur
    phone: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    skills: List[str] = []
    languages: List[str] = []
    education: List[dict] = []
    experience: List[dict] = []
    projects: List[dict] = []
    certifications: List[str] = []
    seniority: Optional[str] = None
    target_roles: List[str] = []
    improvement_tips: List[str] = []

    @field_validator("full_name", "location", "summary", mode="before")
    @classmethod
    def _opt_str(cls, v):
        return str(v).strip()[:600] if isinstance(v, (str, int, float)) and str(v).strip() else None

    @field_validator("skills", mode="before")
    @classmethod
    def _skills(cls, v):
        return _str_list(v, 40)

    @field_validator("languages", "certifications", "target_roles", mode="before")
    @classmethod
    def _short_lists(cls, v):
        return _str_list(v, 10)

    @field_validator("improvement_tips", mode="before")
    @classmethod
    def _tips(cls, v):
        return _str_list(v, 5)

    @field_validator("education", "experience", "projects", mode="before")
    @classmethod
    def _dicts(cls, v):
        return _dict_list(v, 15)

    @field_validator("seniority", mode="before")
    @classmethod
    def _seniority(cls, v):
        v = str(v or "").strip().upper()
        return v if v in {"JUNIOR", "ORTA", "UZMAN"} else None


_YEAR_RE = re.compile(r"(19|20)\d{2}")
_ONGOING_WORDS = ("devam", "present", "halen", "hala", "gunumuz", "bugun", "current", "now", "suan")
_INTERNSHIP_WORDS = ("staj", "intern")


def estimate_experience_years(experience: List[dict], current_year: Optional[int] = None) -> Optional[int]:
    """
    Tam zamanlı deneyim yılını deneyim tarihlerinden hesaplar: stajlar hariç,
    çakışan dönemler birleştirilir. Hiçbir tarih okunamazsa None döner (bu
    durumda LLM'in kıdem tahminine düşülür). LLM'in kıdem tahmini canlı
    testlerde tutarsız çıktığı için (aynı ~4 yıllık deneyime bir kez JUNIOR,
    bir kez UZMAN) kıdem mümkün olduğunda koddan, deterministik belirlenir.
    """
    current_year = current_year or datetime.now(timezone.utc).year
    spans = []
    saw_dates = False
    for exp in experience:
        start_match = _YEAR_RE.search(str(exp.get("start") or ""))
        if not start_match:
            continue
        saw_dates = True
        if any(w in ats_service.fold(str(exp.get("title") or "")) for w in _INTERNSHIP_WORDS):
            continue
        start = int(start_match.group(0))
        end_raw = str(exp.get("end") or "")
        end_match = _YEAR_RE.search(end_raw)
        if end_match:
            end = int(end_match.group(0))
        elif any(w in ats_service.fold(end_raw) for w in _ONGOING_WORDS):
            end = current_year
        else:
            end = start
        if start <= end <= current_year:
            spans.append((start, end))

    if not saw_dates:
        return None
    total, last_end = 0, None
    for start, end in sorted(spans):
        if last_end is not None and start < last_end:
            start = last_end
        if end > start:
            total += end - start
        last_end = max(last_end or end, end)
    return total


def seniority_from_years(years: int) -> str:
    return "JUNIOR" if years < 2 else ("ORTA" if years < 5 else "UZMAN")


def _llm_safe_text(text: str) -> str:
    cleaned = ats_service.mask_contact(text).replace("<", " ").replace(">", " ")
    return cleaned[:MAX_LLM_CV_CHARS]


async def analyze_cv(user_id: str, cv_id: str) -> Dict[str, Any]:
    cv = await cv_service.get_cv(user_id, cv_id)
    if not cv:
        raise ValueError("CV bulunamadı")
    text = cv.get("extracted_text") or ""

    ats = ats_service.score_cv(text, cv.get("extraction_stats") or {}, cv.get("extraction_method") or "")

    profile: Optional[Dict[str, Any]] = None
    profile_error: Optional[str] = None
    try:
        raw = await llm_service.generate_json(
            build_cv_profile_prompt(), build_cv_user_message(_llm_safe_text(text)), purpose="cv_profile",
        )
        profile = CVProfile.model_validate(raw).model_dump()
        profile["email"] = ats["contact"]["email"]
        profile["phone"] = ats["contact"]["phone"]
        years = estimate_experience_years(profile["experience"])
        profile["experience_years"] = years
        if years is not None:
            profile["seniority"] = seniority_from_years(years)
    except Exception as e:
        profile_error = "Profil çıkarma şu an yapılamadı; ATS skoru yine de hesaplandı."
        logger.warning("[cv_analysis] Profil çıkarılamadı (cv_id=%s): %s", cv_id, str(e)[:160])

    suggestions = list(ats["suggestions"])
    for tip in (profile or {}).get("improvement_tips", []):
        if tip not in suggestions:
            suggestions.append(tip)

    if profile:
        supabase.table("cvs").update({"profile": profile}).eq("id", cv_id).eq("user_id", user_id).execute()
    saved = supabase.table("cv_analyses").insert({
        "cv_id": cv_id,
        "user_id": user_id,
        "ats_score": ats["ats_score"],
        "ats_breakdown": ats["breakdown"],
        "suggestions": suggestions,
    }).execute()

    return {
        "cv_id": cv_id,
        "analysis_id": saved.data[0]["id"] if saved.data else None,
        "ats_score": ats["ats_score"],
        "breakdown": ats["breakdown"],
        "suggestions": suggestions,
        "profile": profile,
        "profile_error": profile_error,
        "created_at": saved.data[0].get("created_at") if saved.data else None,
    }


async def latest_analysis(user_id: str, cv_id: str) -> Optional[Dict[str, Any]]:
    cv = await cv_service.get_cv(user_id, cv_id)
    if not cv:
        raise ValueError("CV bulunamadı")
    rows = (
        supabase.table("cv_analyses").select("*").eq("cv_id", cv_id).eq("user_id", user_id)
        .order("created_at", desc=True).limit(1).execute().data or []
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "cv_id": cv_id,
        "analysis_id": row["id"],
        "ats_score": row["ats_score"],
        "breakdown": row["ats_breakdown"],
        "suggestions": row["suggestions"],
        "profile": cv.get("profile"),
        "profile_error": None,
        "created_at": row.get("created_at"),
    }


def _clean_fragment(value: Any, limit: int = 120) -> str:
    return " ".join(str(value or "").replace("<", " ").replace(">", " ").split())[:limit]


def build_candidate_context(profile: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Mülakat promptuna eklenecek KISA aday özeti (en fazla ~800 karakter).
    Veri minimizasyonu: ad, e-posta, telefon, konum ve okul adı gibi kimlik
    bilgileri BİLEREK dahil edilmez; yalnızca soru kişiselleştirmeye yarayan
    beceri/deneyim/proje bilgisi kullanılır.
    """
    if not profile:
        return None

    lines: List[str] = []
    if profile.get("seniority"):
        lines.append(f"Kıdem tahmini: {profile['seniority']}")
    skills = [_clean_fragment(s, 40) for s in (profile.get("skills") or [])[:12]]
    if skills:
        lines.append("Beceriler: " + ", ".join(skills))
    for exp in (profile.get("experience") or [])[:3]:
        title, company = _clean_fragment(exp.get("title"), 60), _clean_fragment(exp.get("company"), 60)
        if title or company:
            period = " - ".join(p for p in (_clean_fragment(exp.get("start"), 20), _clean_fragment(exp.get("end"), 20)) if p)
            lines.append(f"Deneyim: {title or '?'} @ {company or '?'}" + (f" ({period})" if period else ""))
    for proj in (profile.get("projects") or [])[:3]:
        name = _clean_fragment(proj.get("name"), 60)
        if name:
            tech = ", ".join(_clean_fragment(t, 30) for t in (proj.get("tech") or [])[:5] if isinstance(t, str))
            lines.append(f"Proje: {name}" + (f" ({tech})" if tech else ""))

    return "\n".join(lines)[:800] or None
