"""
Analytics API Route'ları
========================
Video/ses dosyası yükleyerek AI analiz pipeline'ını arka planda başlatır.
Analiz durumunu ve sonuçlarını sorgulamak için endpoint'ler sağlar.
"""

import os
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.api.schemas.analytics import (
    AnalyticsResponse,
    AnalyticsStatusResponse,
    AnalyticsStartResponse,
)
from app.services.analytics import run_full_analysis
from app.core.config import settings
from app.core.database import supabase

logger = logging.getLogger(__name__)

router = APIRouter()

# İzin verilen dosya uzantıları
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"}
ALLOWED_EXTENSIONS = ALLOWED_VIDEO_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS

# Maksimum dosya boyutu (500 MB)
MAX_FILE_SIZE_MB = 500


@router.post("/analyze/{interview_id}", response_model=AnalyticsStartResponse)
async def start_analysis(
    interview_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Video veya ses dosyası yükleyerek AI analiz pipeline'ını arka planda başlatır.

    - **interview_id**: Mülakatın UUID'si
    - **file**: Video (.mp4, .avi, .mov, .mkv, .webm) veya Ses (.wav, .mp3, .m4a, .ogg) dosyası

    Sunucuyu kilitlemez — analiz arka planda çalışır.
    Sonucu `GET /status/{interview_id}` ve `GET /results/{interview_id}` ile sorgulayın.
    """
    # --- Validasyonlar ---

    # Dosya uzantısı kontrolü
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen dosya formatı: '{file_ext}'. "
                   f"İzin verilenler: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Dosya tipi belirleme
    file_type = "video" if file_ext in ALLOWED_VIDEO_EXTENSIONS else "audio"

    # --- Geçici dosya kaydetme ---
    temp_dir = settings.TEMP_UPLOAD_DIR
    os.makedirs(temp_dir, exist_ok=True)

    # Benzersiz dosya adı
    unique_name = f"{interview_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    temp_path = os.path.join(temp_dir, unique_name)

    try:
        # Dosyayı chunk'lar halinde yaz (bellek dostu)
        total_bytes = 0
        max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

        with open(temp_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    os.remove(temp_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Dosya boyutu çok büyük. Maksimum: {MAX_FILE_SIZE_MB} MB",
                    )
                f.write(chunk)

        logger.info(
            "Dosya kaydedildi: %s (%.1f MB, tip=%s)",
            temp_path, total_bytes / (1024 * 1024), file_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Dosya kaydetme hatası: %s", e)
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {str(e)}")

    # --- Arka plan görevi başlat ---
    background_tasks.add_task(
        run_full_analysis,
        file_path=temp_path,
        interview_id=interview_id,
        file_type=file_type,
    )

    logger.info("Analiz arka planda başlatıldı: interview_id=%s", interview_id)

    return AnalyticsStartResponse(
        interview_id=interview_id,
        status="processing",
        message="Analiz arka planda başlatıldı. Sonuçları /status ve /results endpoint'lerinden sorgulayabilirsiniz.",
    )


@router.get("/status/{interview_id}", response_model=AnalyticsStatusResponse)
async def get_analysis_status(
    interview_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Belirli bir mülakatın analiz durumunu sorgular.

    Durumlar:
    - **pending**: Henüz başlatılmadı
    - **processing**: Analiz devam ediyor
    - **completed**: Analiz tamamlandı
    - **failed**: Analiz hata verdi
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Veritabanı bağlantısı yok.")

    try:
        result = (
            supabase.table("interview_analytics")
            .select("interview_id, analysis_status, error_message")
            .eq("interview_id", interview_id)
            .execute()
        )

        if not result.data:
            return AnalyticsStatusResponse(
                interview_id=interview_id,
                analysis_status="not_found",
                error_message="Bu mülakat için henüz analiz başlatılmamış.",
            )

        row = result.data[0]
        return AnalyticsStatusResponse(
            interview_id=row["interview_id"],
            analysis_status=row["analysis_status"],
            error_message=row.get("error_message"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Durum sorgulama hatası: {str(e)}")


@router.get("/results/{interview_id}", response_model=AnalyticsResponse)
async def get_analysis_results(
    interview_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Tamamlanmış analiz sonuçlarını getirir.

    Dönen metrikler:
    - **confidence_pct**: Özgüven skoru (0-100)
    - **eye_contact_pct**: Göz teması yüzdesi
    - **pause_count**: Duraksama sayısı (>1.5s)
    - **filler_word_count**: Dolgu kelime sayısı
    - **filler_words_detail**: Dolgu kelime detayı {"ee": 3, "şey": 2}
    - **speech_rate_wpm**: Konuşma hızı (kelime/dakika)
    - **dominant_emotion**: Baskın duygu
    - **emotion_distribution**: Duygu dağılımı
    - **transcript**: Tam transkript metni
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Veritabanı bağlantısı yok.")

    try:
        result = (
            supabase.table("interview_analytics")
            .select("*")
            .eq("interview_id", interview_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Bu mülakat için analiz sonucu bulunamadı.",
            )

        row = result.data[0]

        if row["analysis_status"] == "processing":
            raise HTTPException(
                status_code=202,
                detail="Analiz hâlâ devam ediyor. Lütfen daha sonra tekrar deneyin.",
            )

        if row["analysis_status"] == "failed":
            raise HTTPException(
                status_code=422,
                detail=f"Analiz başarısız oldu: {row.get('error_message', 'Bilinmeyen hata')}",
            )

        return AnalyticsResponse(
            interview_id=row["interview_id"],
            confidence_pct=row.get("confidence_pct", 0),
            eye_contact_pct=row.get("eye_contact_pct", 0),
            pause_count=row.get("pause_count", 0),
            filler_word_count=row.get("filler_word_count", 0),
            filler_words_detail=row.get("filler_words_detail", {}),
            speech_rate_wpm=row.get("speech_rate_wpm", 0),
            dominant_emotion=row.get("dominant_emotion", "neutral"),
            emotion_distribution=row.get("emotion_distribution", {}),
            transcript=row.get("transcript", ""),
            analysis_status=row.get("analysis_status", "unknown"),
            error_message=row.get("error_message"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sonuç sorgulama hatası: {str(e)}")
