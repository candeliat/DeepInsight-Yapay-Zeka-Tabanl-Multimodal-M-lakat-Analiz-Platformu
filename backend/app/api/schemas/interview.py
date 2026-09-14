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
    # Video/ses analizinden gelen OBJEKTİF özgüven skoru (göz teması, stres,
    # konuşma hızından hesaplanır) — analiz tamamlandıysa dolu, aksi halde
    # None. Doluysa `average_score` hesaplamasında `confidence_score` (LLM'in
    # SÜBJEKTİF, salt metne dayalı tahmini) yerine bu kullanılır; bkz.
    # app/services/llm_service.py:InterviewEvaluation docstring'i.
    objective_confidence_pct: Optional[float] = None
    created_at: str

class InterviewMessage(BaseModel):
    role: str
    content: str
    created_at: str

class InterviewDetail(InterviewSummary):
    feedback: Optional[str] = None
    messages: List[InterviewMessage] = []
