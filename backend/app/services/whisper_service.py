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
import shutil
import subprocess
import threading

import numpy as np

logger = logging.getLogger(__name__)

_model = None
_lock = threading.Lock()
SAMPLE_RATE = 16000  # Whisper'ın beklediği örnekleme hızı


def ffmpeg_exe() -> str:
    """Sistemdeki ffmpeg; yoksa imageio-ffmpeg'in getirdiği ikili (Windows'ta PATH'te ffmpeg olmayabilir)."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def load_audio(path: str) -> np.ndarray:
    """Ses/video dosyasını Whisper'ın istediği 16 kHz mono float32 diziye çevirir.

    whisper.transcribe'a dosya yolu verilirse PATH'teki "ffmpeg"i çağırır; PATH'te yoksa
    FileNotFoundError (WinError 2) ile video analizi ve sesli cevap çözümleme düşüyordu.
    """
    cmd = [ffmpeg_exe(), "-nostdin", "-threads", "0", "-i", path,
           "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-"]
    out = subprocess.run(cmd, capture_output=True, check=True, timeout=300).stdout
    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0


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
