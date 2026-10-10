"""
İş ilanı yönetimi ve CV ↔ ilan eşleştirme.

- İlan gereksinimleri LLM ile çıkarılır (zorunlu; çıkarılamazsa ilan kaydedilmez).
- Eşleşme skoru deterministiktir (bkz. skill_matching.py); LLM yalnızca özet ve
  öğrenme yol haritasını yazar, çökerse koddan basit bir yol haritası üretilir.
- Her işlem sahiplik kontrolüyle yapılır (user_id = oturumdaki kullanıcı).
"""
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.database import supabase
from app.services import ats_service, cv_service, skill_matching
from app.services.llm_service import llm_service
from app.services.prompts.job_v1 import (
    build_job_requirements_prompt,
    build_job_user_message,
    build_roadmap_prompt,
    build_roadmap_user_message,
)

logger = logging.getLogger(__name__)

MIN_JOB_TEXT = 80
MAX_JOB_TEXT = 15_000


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def _safe(text: str, limit: int) -> str:
    return ats_service.mask_contact(str(text or "")).replace("<", " ").replace(">", " ")[:limit]


def _str_list(v: Any, limit: int) -> List[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip()[:80] for x in v if isinstance(x, (str, int, float)) and str(x).strip()][:limit]


class JobRequirements(BaseModel):
    """LLM çıktısının toleranslı şeması."""
    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = None
    company: Optional[str] = None
    seniority: Optional[str] = None
    min_years_experience: Optional[int] = None
    required_skills: List[str] = []
    nice_to_have_skills: List[str] = []
    responsibilities: List[str] = []
    languages: List[str] = []

    @field_validator("title", "company", mode="before")
    @classmethod
    def _opt(cls, v):
        return str(v).strip()[:150] if isinstance(v, (str, int, float)) and str(v).strip() else None

    @field_validator("seniority", mode="before")
    @classmethod
    def _sen(cls, v):
        v = str(v or "").strip().upper()
        return v if v in {"JUNIOR", "ORTA", "UZMAN"} else None

    @field_validator("min_years_experience", mode="before")
    @classmethod
    def _years(cls, v):
        try:
            v = int(v)
        except (TypeError, ValueError):
            return None
        return v if 0 < v <= 30 else None

    @field_validator("required_skills", mode="before")
    @classmethod
    def _req(cls, v):
        return _str_list(v, 25)

    @field_validator("nice_to_have_skills", mode="before")
    @classmethod
    def _nice(cls, v):
        return _str_list(v, 20)

    @field_validator("responsibilities", mode="before")
    @classmethod
    def _resp(cls, v):
        return [s[:200] for s in _str_list(v, 8)]

    @field_validator("languages", mode="before")
    @classmethod
    def _langs(cls, v):
        return _str_list(v, 5)


# --- ilanlar ---

_LIST_COLUMNS = "id, title, company, requirements, created_at"


async def create_job(user_id: str, text: str, title: Optional[str] = None, company: Optional[str] = None) -> Dict[str, Any]:
    text = (text or "").strip()
    if len(text) < MIN_JOB_TEXT:
        raise ValueError(f"İlan metni çok kısa (en az {MIN_JOB_TEXT} karakter).")
    text = text[:MAX_JOB_TEXT]

    raw = await llm_service.generate_json(
        build_job_requirements_prompt(), build_job_user_message(_safe(text, MAX_JOB_TEXT)), purpose="job_requirements",
    )
    reqs = JobRequirements.model_validate(raw).model_dump()
    if not reqs["required_skills"] and not reqs["nice_to_have_skills"]:
        raise ValueError("İlandan beceri gereksinimi çıkarılamadı. Metnin bir iş ilanı olduğundan emin olun.")

    result = _db().table("job_postings").insert({
        "user_id": user_id,
        "title": (title or "").strip()[:150] or reqs["title"],
        "company": (company or "").strip()[:150] or reqs["company"],
        "raw_text": text,
        "requirements": reqs,
    }).execute()
    if not result.data:
        raise RuntimeError("İlan kaydedilemedi")
    return result.data[0]


async def list_jobs(user_id: str) -> List[Dict[str, Any]]:
    result = _db().table("job_postings").select(_LIST_COLUMNS).eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data or []


async def get_job(user_id: str, job_id: str) -> Optional[Dict[str, Any]]:
    result = _db().table("job_postings").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    return result.data[0] if result.data else None


async def delete_job(user_id: str, job_id: str) -> bool:
    if not await get_job(user_id, job_id):
        return False
    _db().table("job_postings").delete().eq("id", job_id).eq("user_id", user_id).execute()
    return True


# --- eşleştirme ---

def _fallback_roadmap(missing: List[str]) -> List[Dict[str, Any]]:
    return [
        {
            "skill": skill,
            "priority": "yüksek",
            "why": "İlanda zorunlu beceri olarak isteniyor ve CV'nizde görünmüyor.",
            "steps": [
                "Resmi dokümantasyondan temel kavramları çalışın.",
                "Bu beceriyi kullanan küçük bir proje yapın.",
                "Projeyi ve beceriyi CV'nize ekleyin.",
            ],
            "est_weeks": 2,
        }
        for skill in missing[:6]
    ]


def _clean_roadmap(items: Any, allowed: List[str]) -> List[Dict[str, Any]]:
    allowed_keys = {skill_matching.skill_key(s) for s in allowed}
    out = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("skill"), str):
            continue
        if skill_matching.skill_key(item["skill"]) not in allowed_keys:
            continue  # LLM'in uydurduğu, eksik listesinde olmayan becerileri at
        try:
            weeks = max(1, min(26, int(item.get("est_weeks") or 2)))
        except (TypeError, ValueError):
            weeks = 2
        out.append({
            "skill": item["skill"][:80],
            "priority": "orta" if item.get("priority") == "orta" else "yüksek",
            "why": str(item.get("why") or "")[:300],
            "steps": _str_list(item.get("steps"), 4),
            "est_weeks": weeks,
        })
    return out[:6]


async def match_job_with_cv(user_id: str, job_id: str, cv_id: str) -> Dict[str, Any]:
    job = await get_job(user_id, job_id)
    if not job:
        raise ValueError("İlan bulunamadı")
    cv = await cv_service.get_cv(user_id, cv_id)
    if not cv:
        raise ValueError("CV bulunamadı")
    if not cv.get("profile"):
        raise PermissionError("Bu CV henüz analiz edilmemiş. Önce CV analizini çalıştırın.")

    reqs = job.get("requirements") or {}
    match = skill_matching.compute_match(reqs, cv["profile"], cv.get("extracted_text") or "")
    missing = match["missing_required"] + match["missing_nice"]

    n_req = len(match["required"])
    n_have = sum(1 for i in match["required"] if i["status"] != "missing")
    summary = f"İlanın zorunlu becerilerinin {n_have}/{n_req} tanesi CV'nizde var." if n_req else None
    roadmap: List[Dict[str, Any]] = []
    interview_focus: List[str] = []
    llm_error: Optional[str] = None

    if missing:
        try:
            raw = await llm_service.generate_json(
                build_roadmap_prompt(),
                build_roadmap_user_message(
                    _safe(job.get("title") or "", 150), reqs.get("seniority") or "",
                    [_safe(s, 80) for s in missing[:12]],
                    [_safe(s, 40) for s in skill_matching.cv_skill_list(cv["profile"])[:15]],
                ),
                purpose="job_roadmap",
            )
            if isinstance(raw.get("summary"), str) and raw["summary"].strip():
                summary = raw["summary"].strip()[:600]
            roadmap = _clean_roadmap(raw.get("roadmap"), missing)
            interview_focus = _str_list(raw.get("interview_focus"), 5)
        except Exception as e:
            llm_error = "Yol haritası yapay zekâ ile hazırlanamadı; temel bir plan gösteriliyor."
            logger.warning("[job_service] Yol haritası üretilemedi (job_id=%s): %s", job_id, str(e)[:160])
        if not roadmap:
            roadmap = _fallback_roadmap(match["missing_required"] or missing)

    breakdown = {k: match[k] for k in ("required", "nice_to_have", "experience", "components", "missing_required", "missing_nice", "underlisted")}
    breakdown["interview_focus"] = interview_focus
    saved = _db().table("job_matches").insert({
        "user_id": user_id,
        "job_id": job_id,
        "cv_id": cv_id,
        "match_score": match["match_score"],
        "breakdown": breakdown,
        "roadmap": roadmap,
        "summary": summary,
    }).execute()

    return {
        "match_id": saved.data[0]["id"] if saved.data else None,
        "job_id": job_id,
        "cv_id": cv_id,
        "match_score": match["match_score"],
        "breakdown": breakdown,
        "roadmap": roadmap,
        "summary": summary,
        "llm_error": llm_error,
        "created_at": saved.data[0].get("created_at") if saved.data else None,
    }


async def latest_match(user_id: str, job_id: str, cv_id: str) -> Optional[Dict[str, Any]]:
    if not await get_job(user_id, job_id):
        raise ValueError("İlan bulunamadı")
    rows = (
        _db().table("job_matches").select("*").eq("job_id", job_id).eq("cv_id", cv_id).eq("user_id", user_id)
        .order("created_at", desc=True).limit(1).execute().data or []
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "match_id": row["id"], "job_id": job_id, "cv_id": cv_id, "match_score": row["match_score"],
        "breakdown": row["breakdown"], "roadmap": row["roadmap"], "summary": row.get("summary"),
        "llm_error": None, "created_at": row.get("created_at"),
    }


# --- mülakat bağlamı ---

def build_job_context(job: Dict[str, Any], missing: Optional[List[str]] = None) -> Optional[str]:
    """Mülakat promptuna eklenecek kısa ilan bağlamı (kimlik bilgisi içermez, açı parantezi temizlenir)."""
    reqs = job.get("requirements") or {}
    clean = lambda v, n: " ".join(str(v or "").replace("<", " ").replace(">", " ").split())[:n]  # noqa: E731
    lines = []
    title = clean(job.get("title"), 100)
    company = clean(job.get("company"), 80)
    if title:
        lines.append(f"Hedef ilan: {title}" + (f" ({company})" if company else ""))
    req = [clean(s, 40) for s in (reqs.get("required_skills") or [])[:12]]
    if req:
        lines.append("İlanın zorunlu becerileri: " + ", ".join(req))
    if missing:
        lines.append(
            "Adayın CV'sinde görünmeyen beceriler (bunları adayı küçük düşürmeden, temel düzeyde yokla): "
            + ", ".join(clean(s, 40) for s in missing[:8])
        )
    return "\n".join(lines)[:700] or None
