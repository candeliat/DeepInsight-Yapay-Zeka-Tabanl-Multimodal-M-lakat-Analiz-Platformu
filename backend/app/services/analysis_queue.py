"""
Video/ses analizi kuyruğu.

Analiz (DeepFace + MediaPipe + Whisper) bir iş başına GB'larca bellek ve dakikalarca CPU
kullanır. Önceden her yükleme FastAPI BackgroundTasks ile hemen başlıyordu: aynı anda
gelen birkaç yükleme analizleri paralel çalıştırıp makineyi bellekten düşürebiliyordu ve
BackgroundTasks'ın paylaştığı iş parçacığı havuzunu (to_thread çağrıları) da tıkıyordu.

Burada işler ayrı, boyutu sınırlı bir havuzda sırayla çalışır (ANALYSIS_MAX_CONCURRENCY,
varsayılan 1). Sıradaki iş "queued" durumunda bekler; kullanıcıya önünde kaç analiz
olduğu gösterilir. Kuyruk ANALYSIS_MAX_QUEUE'yu aşarsa yeni yükleme reddedilir (503).

Kuyruk süreç içindedir: sunucu yeniden başlarsa bekleyen işler ve geçici dosyaları
kaybolur. `recover_after_restart` açılışta bu kayıtları "failed" yapar ki istemciler
sonsuza kadar "işleniyor" beklemesin.
"""
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.core.config import settings
from app.services import analytics

logger = logging.getLogger(__name__)

RESTART_MESSAGE = "Sunucu yeniden başlatıldığı için analiz yarıda kaldı. Kaydı yeniden yükleyebilirsiniz."

_executor = ThreadPoolExecutor(max_workers=settings.ANALYSIS_MAX_CONCURRENCY, thread_name_prefix="analysis")
_lock = threading.Lock()
_waiting: list[str] = []   # sırada bekleyen interview_id'ler (FIFO)
_running: set[str] = set()


class QueueFull(Exception):
    pass


class AlreadyQueued(Exception):
    pass


def submit(file_path: str, interview_id: str, file_type: str) -> int:
    """İşi kuyruğa ekler ve önündeki iş sayısını döner (0 = hemen başlar)."""
    with _lock:
        if interview_id in _running or interview_id in _waiting:
            raise AlreadyQueued
        if len(_waiting) >= settings.ANALYSIS_MAX_QUEUE:
            raise QueueFull
        ahead = len(_running) + len(_waiting)
        _waiting.append(interview_id)
    # Durum hemen yazılır: istemci ilk sorguda "not_found" görmesin.
    analytics._update_analysis_status(interview_id, "queued" if ahead else "processing")
    _executor.submit(_run, file_path, interview_id, file_type)
    return ahead


def _run(file_path: str, interview_id: str, file_type: str) -> None:
    with _lock:
        _waiting.remove(interview_id)
        _running.add(interview_id)
    try:
        analytics.run_full_analysis(file_path=file_path, interview_id=interview_id, file_type=file_type)
    finally:
        with _lock:
            _running.discard(interview_id)


def position(interview_id: str) -> Optional[int]:
    """Sıradaki işin önündeki iş sayısı; sırada değilse (çalışıyor/bitti) None."""
    with _lock:
        if interview_id not in _waiting:
            return None
        return len(_running) + _waiting.index(interview_id)


def recover_after_restart() -> int:
    """Önceki süreçte yarıda kalan analizleri "failed" yapar ve sahipsiz geçici dosyaları siler."""
    from app.core.database import sync_supabase

    recovered = 0
    if sync_supabase:
        try:
            result = (
                sync_supabase.table("interview_analytics")
                .update({"analysis_status": "failed", "error_message": RESTART_MESSAGE})
                .in_("analysis_status", ["queued", "processing"])
                .execute()
            )
            recovered = len(result.data or [])
        except Exception:
            logger.warning("Yarıda kalan analizler işaretlenemedi.", exc_info=True)

    # Kuyruk boşken temp_uploads'ta kalan her şey önceki süreçten kalmadır (kişisel veri).
    temp_dir = settings.TEMP_UPLOAD_DIR
    if os.path.isdir(temp_dir):
        for name in os.listdir(temp_dir):
            try:
                os.remove(os.path.join(temp_dir, name))
            except OSError:
                pass
    if recovered:
        logger.info("Yarıda kalan %d analiz 'failed' olarak işaretlendi.", recovered)
    return recovered
