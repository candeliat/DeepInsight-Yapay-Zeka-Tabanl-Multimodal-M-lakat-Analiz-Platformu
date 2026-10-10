"""
CV analizi: (1) deterministik ATS skoru (her zaman), (2) LLM ile yapılandırılmış
profil + içerik önerileri (best-effort). LLM çökerse analiz yine ATS skoruyla
döner — `profile_error` alanı arayüze durumu bildirir.

Veri minimizasyonu: LLM'e gönderilen metinde e-posta/telefon maskelenir ve
açı parantezleri temizlenir (prompt'taki etiket sınırlarının kırılmasını önler).
"""
import logging
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
