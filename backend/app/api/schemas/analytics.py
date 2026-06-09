"""
Pydantic şemaları — Analiz (Analytics) API endpoint'leri için.
"""

from pydantic import BaseModel
from typing import Optional, Dict


class AnalyticsResponse(BaseModel):
    """Tamamlanmış analiz sonuçları."""
    interview_id: str
    confidence_pct: float = 0.0
    eye_contact_pct: float = 0.0
    pause_count: int = 0
    filler_word_count: int = 0
    filler_words_detail: Dict[str, int] = {}
    speech_rate_wpm: float = 0.0
    dominant_emotion: str = "neutral"
    emotion_distribution: Dict[str, float] = {}
    transcript: str = ""
    analysis_status: str = "pending"
    error_message: Optional[str] = None


class AnalyticsStatusResponse(BaseModel):
    """Analiz durum sorgulama yanıtı."""
    interview_id: str
    analysis_status: str
    error_message: Optional[str] = None


class AnalyticsStartResponse(BaseModel):
    """Analiz başlatma yanıtı."""
    interview_id: str
    status: str = "processing"
    message: str = "Analiz arka planda başlatıldı."
