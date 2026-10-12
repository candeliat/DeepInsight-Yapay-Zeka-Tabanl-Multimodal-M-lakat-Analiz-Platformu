from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ConsentStatus(BaseModel):
    consent_type: str
    version: str
    text: str
    granted: bool


class CVItem(BaseModel):
    id: str
    org_id: Optional[str] = None
    original_filename: str
    mime_type: str
    size_bytes: int
    extraction_method: Optional[str] = None
    status: str
    created_at: Optional[str] = None


class CVDetail(CVItem):
    extracted_text: Optional[str] = None
    extraction_stats: Dict[str, Any] = {}
    profile: Optional[Dict[str, Any]] = None


class ATSCheck(BaseModel):
    id: str
    label: str
    weight: int
    earned: int
    status: str
    detail: str
    tip: Optional[str] = None


class CVAnalysis(BaseModel):
    cv_id: str
    analysis_id: Optional[str] = None
    ats_score: int
    breakdown: List[ATSCheck]
    suggestions: List[str]
    profile: Optional[Dict[str, Any]] = None
    profile_error: Optional[str] = None
    created_at: Optional[str] = None
