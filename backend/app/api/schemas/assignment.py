from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

_LEVELS = {"JUNIOR", "ORTA", "UZMAN"}


class AssignmentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    role: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=120)
    difficulty: Optional[str] = None
    instructions: Optional[str] = Field(default=None, max_length=1000)
    due_at: Optional[datetime] = None
    group_id: Optional[str] = None  # verilirse yalnızca o grubun öğrencilerine atanır

    @field_validator("title", "role", "topic", "instructions")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = " ".join(v.replace("<", " ").replace(">", " ").split())
        return v or None

    @field_validator("difficulty")
    @classmethod
    def _level(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().upper()
        if v not in _LEVELS:
            raise ValueError("Zorluk JUNIOR, ORTA veya UZMAN olmalı.")
        return v


class AssignmentItem(BaseModel):
    id: str
    org_id: str
    title: str
    role: str
    topic: str
    difficulty: Optional[str] = None
    instructions: Optional[str] = None
    due_at: Optional[str] = None
    group_id: Optional[str] = None
    created_at: Optional[str] = None
    last_reminded_at: Optional[str] = None


class OrgAssignmentItem(AssignmentItem):
    total_candidates: int = 0
    completed_count: int = 0
    in_progress_count: int = 0


AssignmentStatus = Literal["not_started", "in_progress", "completed"]


class AssignmentStudentRow(BaseModel):
    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None
    status: AssignmentStatus
    completed_at: Optional[str] = None
    share_progress: bool = False
    score: Optional[float] = None  # yalnızca öğrenci paylaşım rızası verdiyse


class MyAssignmentItem(AssignmentItem):
    org_name: Optional[str] = None
    status: AssignmentStatus
    my_score: Optional[float] = None
    interview_id: Optional[str] = None
    overdue: bool = False
