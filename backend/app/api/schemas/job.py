from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    text: str = Field(min_length=80, max_length=15000)
    title: Optional[str] = Field(default=None, max_length=150)
    company: Optional[str] = Field(default=None, max_length=150)


class JobItem(BaseModel):
    id: str
    title: Optional[str] = None
    company: Optional[str] = None
    requirements: Dict[str, Any] = {}
    created_at: Optional[str] = None


class JobDetail(JobItem):
    raw_text: str


class MatchRequest(BaseModel):
    cv_id: str = Field(min_length=1, max_length=64)


class CoverLetterRequest(BaseModel):
    cv_id: str = Field(min_length=1, max_length=64)
    language: Literal["tr", "en"] = "tr"
    tone: Literal["resmi", "samimi"] = "resmi"
    # Adayın öne çıkarmak istediği nokta (ör. "staj projemi vurgula"); modele veri olarak gider.
    note: Optional[str] = Field(default=None, max_length=500)


class CoverLetter(BaseModel):
    subject: str
    body: str
    language: str
    tone: str
    highlighted_skills: List[str] = []
    # CV'de dayanağı olmayan sayılar / CV'de görünmeyen ilan becerileri (deterministik denetim).
    warnings: List[str] = []
    word_count: int


class RoadmapItem(BaseModel):
    skill: str
    priority: str
    why: str
    steps: List[str]
    est_weeks: int


class JobMatch(BaseModel):
    match_id: Optional[str] = None
    job_id: str
    cv_id: str
    match_score: int
    breakdown: Dict[str, Any]
    roadmap: List[RoadmapItem]
    summary: Optional[str] = None
    llm_error: Optional[str] = None
    created_at: Optional[str] = None
