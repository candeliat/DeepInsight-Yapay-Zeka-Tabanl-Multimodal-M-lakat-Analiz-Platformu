"""
Paylaşılan Whisper model singleton'ı.

Önceden `analytics.py` (video/ses analiz pipeline'ı) ve `llm_service.py`
(mülakat sırasında sesli cevap transkripsiyonu) her biri kendi Whisper
instance'ını ayrı ayrı yüklüyordu — aynı process içinde 2x RAM tüketimi
ve `llm_service.py` tarafında HER çağrıda modelin diskten yeniden
yüklenmesi (saniyeler süren gereksiz gecikme) söz konusuydu.

Bu modül tek bir process-wide singleton sağlar; her iki servis de
aynı yüklenmiş modeli paylaşır.
"""

import logging
import threading

logger = logging.getLogger(__name__)

_model = None
_lock = threading.Lock()


def get_whisper_model():
    """
    Whisper modelini process içinde tek seferlik yükler ve döner.
    Thread-safe: BackgroundTasks (thread pool) ve event loop'tan eşzamanlı
    çağrılsa bile model yalnızca bir kez yüklenir.
    """
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                import whisper
                from app.core.config import settings
                logger.info("Whisper '%s' modeli yükleniyor (paylaşılan singleton)...", settings.WHISPER_MODEL)
                _model = whisper.load_model(settings.WHISPER_MODEL)
                logger.info("Whisper modeli yüklendi.")
    return _model
