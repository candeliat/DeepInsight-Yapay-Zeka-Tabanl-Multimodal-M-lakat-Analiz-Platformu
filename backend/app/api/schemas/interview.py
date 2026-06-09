from pydantic import BaseModel
from typing import List, Optional

class InterviewSummary(BaseModel):
    id: str
    user_id: str
    role: str
    topic: str
    status: str
    technical_score: Optional[int] = None
    confidence_score: Optional[int] = None
    vocabulary_score: Optional[int] = None
    average_score: Optional[float] = None
    created_at: str

class InterviewMessage(BaseModel):
    role: str
    content: str
    created_at: str

class InterviewDetail(InterviewSummary):
    feedback: Optional[str] = None
    messages: List[InterviewMessage] = []
