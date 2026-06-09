"""
DeepInsight — Yapay Zeka Video/Ses Analiz Pipeline'ı
=====================================================
Bu modül, mülakat videolarını ve seslerini açık kaynak AI araçlarıyla analiz eder.

Bileşenler:
  - VideoAnalyzer : DeepFace (duygu) + MediaPipe (göz teması)
  - AudioAnalyzer : Whisper (transkript) + Librosa (duraksama) + Regex (dolgu kelime)
  - run_full_analysis() : Tüm pipeline'ı çalıştırır
  - save_analytics_to_db() : Sonuçları Supabase'e kaydeder
"""

import os
import re
import logging
import tempfile
import traceback
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timezone

import numpy as np
import cv2

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy imports — ağır kütüphaneler yalnızca ihtiyaç duyulduğunda yüklenir
# ---------------------------------------------------------------------------
_whisper_model = None
_face_mesh = None


def _get_whisper_model():
    """Whisper modelini singleton olarak yükler (ilk çağrıda indirilir)."""
    global _whisper_model
    if _whisper_model is None:
        import whisper
        from app.core.config import settings
        logger.info("Whisper '%s' modeli yükleniyor...", settings.WHISPER_MODEL)
        _whisper_model = whisper.load_model(settings.WHISPER_MODEL)
        logger.info("Whisper modeli yüklendi.")
    return _whisper_model


def _get_face_mesh():
    """MediaPipe FaceMesh'i singleton olarak başlatır."""
    global _face_mesh
    if _face_mesh is None:
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
        import os
        model_path = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            num_faces=1,
            min_face_detection_confidence=0.5
        )
        _face_mesh = vision.FaceLandmarker.create_from_options(options)
        logger.info("MediaPipe FaceLandmarker başlatıldı.")
    return _face_mesh


# ============================================================================
#  VIDEO ANALİZİ
# ============================================================================

class VideoAnalyzer:
    """Videodan duygu ve göz teması analizi yapar."""

    # MediaPipe FaceMesh landmark indeksleri
    # Sol göz
    LEFT_EYE_TOP = 159
    LEFT_EYE_BOTTOM = 145
    LEFT_EYE_LEFT = 33
    LEFT_EYE_RIGHT = 133
    # Sağ göz
    RIGHT_EYE_TOP = 386
    RIGHT_EYE_BOTTOM = 374
    RIGHT_EYE_LEFT = 362
    RIGHT_EYE_RIGHT = 263
    # İris merkezleri (refine_landmarks=True gerektirir)
    LEFT_IRIS_CENTER = 468
    RIGHT_IRIS_CENTER = 473

    # Göz kırpma eşiği (EAR - Eye Aspect Ratio)
    EAR_BLINK_THRESHOLD = 0.20
    # Göz teması ofseti eşiği (normalize edilmiş)
    GAZE_THRESHOLD = 0.28

    @staticmethod
    def extract_frames(video_path: str, fps: int = 1) -> list[np.ndarray]:
        """
        Videodan belirli FPS aralığıyla kare çıkarır.

        Args:
            video_path: Video dosyasının yolu
            fps: Saniyede kaç kare alınacağı (varsayılan: 1)

        Returns:
            BGR formatında numpy dizileri listesi
        """
        frames = []
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error("Video açılamadı: %s", video_path)
            return frames

        video_fps = cap.get(cv2.CAP_PROP_FPS)
        if video_fps <= 0:
            video_fps = 30.0  # varsayılan
        frame_interval = int(video_fps / fps)
        if frame_interval < 1:
            frame_interval = 1

        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_count % frame_interval == 0:
                frames.append(frame)
            frame_count += 1

        cap.release()
        logger.info("Video'dan %d kare çıkarıldı (toplam %d kare, interval=%d).",
                     len(frames), frame_count, frame_interval)
        return frames

    @staticmethod
    def analyze_emotions(frames: list[np.ndarray]) -> Dict[str, Any]:
        """
        DeepFace ile her karenin duygu analizini yapar.

        Returns:
            {
                "distribution": {"happy": 30.2, "neutral": 50.0, ...},
                "dominant": "neutral",
                "stress_pct": 15.3
            }
        """
        from deepface import DeepFace

        emotion_sums: Dict[str, float] = {}
        analyzed_count = 0

        for i, frame in enumerate(frames):
            try:
                results = DeepFace.analyze(
                    img_path=frame,
                    actions=["emotion"],
                    enforce_detection=False,
                    silent=True,
                )
                # DeepFace bir liste döner
                if isinstance(results, list):
                    result = results[0]
                else:
                    result = results

                emotions = result.get("emotion", {})
                for emo, score in emotions.items():
                    emotion_sums[emo] = emotion_sums.get(emo, 0.0) + score
                analyzed_count += 1

            except Exception as e:
                logger.warning("Kare %d duygu analizi başarısız: %s", i, e)
                continue

        if analyzed_count == 0:
            return {
                "distribution": {},
                "dominant": "unknown",
                "stress_pct": 0.0,
            }

        # Ortalama dağılımı hesapla
        distribution = {
            emo: round(total / analyzed_count, 2)
            for emo, total in emotion_sums.items()
        }

        # Baskın duygu
        dominant = max(distribution, key=distribution.get) if distribution else "unknown"

        # Stres skoru: fear + angry + sad + disgust
        stress_pct = round(
            distribution.get("fear", 0)
            + distribution.get("angry", 0)
            + distribution.get("sad", 0)
            + distribution.get("disgust", 0),
            2,
        )

        logger.info("Duygu analizi tamamlandı. Baskın: %s, Stres: %.1f%%",
                     dominant, stress_pct)
        return {
            "distribution": distribution,
            "dominant": dominant,
            "stress_pct": stress_pct,
        }

    @classmethod
    def analyze_eye_contact(cls, frames: list[np.ndarray]) -> Dict[str, Any]:
        """
        MediaPipe FaceMesh ile göz teması ve göz kırpma analizi yapar.

        Returns:
            {
                "eye_contact_pct": 78.5,
                "blink_count": 12,
                "total_frames_analyzed": 60
            }
        """
        face_mesh = _get_face_mesh()

        contact_frames = 0
        blink_count = 0
        analyzed_count = 0
        prev_blink_state = False  # önceki kare kırpma durumunda mıydı

        for i, frame in enumerate(frames):
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            import mediapipe as mp
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            results = face_mesh.detect(mp_image)

            if not results.face_landmarks:
                continue

            landmarks = results.face_landmarks[0]
            analyzed_count += 1
            h, w = frame.shape[:2]

            # --- Göz Kırpma (EAR hesabı) ---
            left_ear = cls._calculate_ear(landmarks, w, h, "left")
            right_ear = cls._calculate_ear(landmarks, w, h, "right")
            avg_ear = (left_ear + right_ear) / 2.0

            is_blink = avg_ear < cls.EAR_BLINK_THRESHOLD
            if is_blink and not prev_blink_state:
                blink_count += 1
            prev_blink_state = is_blink

            # --- Göz Teması (iris ofseti) ---
            if len(landmarks) > cls.RIGHT_IRIS_CENTER:
                is_looking = cls._check_gaze(landmarks, w, h)
                if is_looking:
                    contact_frames += 1

        eye_contact_pct = round(
            (contact_frames / analyzed_count * 100) if analyzed_count > 0 else 0.0, 2
        )

        logger.info(
            "Göz teması: %.1f%% (%d/%d kare), Göz kırpma: %d",
            eye_contact_pct, contact_frames, analyzed_count, blink_count,
        )
        return {
            "eye_contact_pct": eye_contact_pct,
            "blink_count": blink_count,
            "total_frames_analyzed": analyzed_count,
        }

    @classmethod
    def _calculate_ear(cls, landmarks, w: int, h: int, side: str) -> float:
        """Eye Aspect Ratio (EAR) hesaplar — kırpma tespiti için."""
        if side == "left":
            top_idx, bottom_idx = cls.LEFT_EYE_TOP, cls.LEFT_EYE_BOTTOM
            left_idx, right_idx = cls.LEFT_EYE_LEFT, cls.LEFT_EYE_RIGHT
        else:
            top_idx, bottom_idx = cls.RIGHT_EYE_TOP, cls.RIGHT_EYE_BOTTOM
            left_idx, right_idx = cls.RIGHT_EYE_LEFT, cls.RIGHT_EYE_RIGHT

        top = np.array([landmarks[top_idx].x * w, landmarks[top_idx].y * h])
        bottom = np.array([landmarks[bottom_idx].x * w, landmarks[bottom_idx].y * h])
        left = np.array([landmarks[left_idx].x * w, landmarks[left_idx].y * h])
        right = np.array([landmarks[right_idx].x * w, landmarks[right_idx].y * h])

        vertical = np.linalg.norm(top - bottom)
        horizontal = np.linalg.norm(left - right)

        if horizontal == 0:
            return 0.0
        return float(vertical / horizontal)

    @classmethod
    def _check_gaze(cls, landmarks, w: int, h: int) -> bool:
        """
        İris merkezinin göz çerçevesi içindeki konumunu hesaplar.
        Merkeze yakınsa 'kameraya bakıyor' sayılır.
        """
        # Sol göz için iris ofseti
        left_iris = np.array([
            landmarks[cls.LEFT_IRIS_CENTER].x * w,
            landmarks[cls.LEFT_IRIS_CENTER].y * h,
        ])
        left_eye_left = np.array([
            landmarks[cls.LEFT_EYE_LEFT].x * w,
            landmarks[cls.LEFT_EYE_LEFT].y * h,
        ])
        left_eye_right = np.array([
            landmarks[cls.LEFT_EYE_RIGHT].x * w,
            landmarks[cls.LEFT_EYE_RIGHT].y * h,
        ])
        left_center = (left_eye_left + left_eye_right) / 2.0
        left_width = np.linalg.norm(left_eye_right - left_eye_left)
        if left_width == 0:
            return False
        left_offset = np.linalg.norm(left_iris - left_center) / left_width

        # Sağ göz için iris ofseti
        right_iris = np.array([
            landmarks[cls.RIGHT_IRIS_CENTER].x * w,
            landmarks[cls.RIGHT_IRIS_CENTER].y * h,
        ])
        right_eye_left = np.array([
            landmarks[cls.RIGHT_EYE_LEFT].x * w,
            landmarks[cls.RIGHT_EYE_LEFT].y * h,
        ])
        right_eye_right = np.array([
            landmarks[cls.RIGHT_EYE_RIGHT].x * w,
            landmarks[cls.RIGHT_EYE_RIGHT].y * h,
        ])
        right_center = (right_eye_left + right_eye_right) / 2.0
        right_width = np.linalg.norm(right_eye_right - right_eye_left)
        if right_width == 0:
            return False
        right_offset = np.linalg.norm(right_iris - right_center) / right_width

        avg_offset = (left_offset + right_offset) / 2.0
        return avg_offset < cls.GAZE_THRESHOLD


# ============================================================================
#  SES ANALİZİ
# ============================================================================

class AudioAnalyzer:
    """Ses verisinden transkript, dolgu kelimesi, duraksama ve konuşma hızı analizi yapar."""

    # Türkçe dolgu kelimeleri regex pattern'i
    FILLER_PATTERN = re.compile(
        r'\b(e{2,}|ı{2,}|ş[eə]y|yani|hani|işte|aslında)\b',
        re.IGNORECASE | re.UNICODE,
    )

    # Duraksama eşiği (saniye)
    PAUSE_THRESHOLD_SEC = 1.5

    # Sessizlik tespiti için dB eşiği
    SILENCE_TOP_DB = 30

    @staticmethod
    def extract_audio_from_video(video_path: str, output_path: str = None) -> str:
        """
        Video dosyasından ses parçasını WAV olarak çıkarır.
        Gerekli: ffmpeg sistemde yüklü olmalı.

        Returns:
            Oluşturulan WAV dosyasının yolu
        """
        if output_path is None:
            output_path = video_path.rsplit(".", 1)[0] + ".wav"

        try:
            import subprocess
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            cmd = [
                ffmpeg_exe, "-y",
                "-i", video_path,
                "-vn",                    # video yok
                "-acodec", "pcm_s16le",   # WAV formatı
                "-ar", "16000",           # 16kHz (Whisper için ideal)
                "-ac", "1",               # mono
                output_path,
            ]
            subprocess.run(cmd, capture_output=True, check=True, timeout=120)
            logger.info("Ses çıkarma tamamlandı: %s", output_path)
            return output_path
        except FileNotFoundError:
            logger.error("ffmpeg bulunamadı! Lütfen ffmpeg'i yükleyin.")
            raise RuntimeError(
                "ffmpeg bulunamadı. Ses çıkarmak için ffmpeg gereklidir. "
                "Yükleme: https://ffmpeg.org/download.html"
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Ses çıkarma zaman aşımına uğradı (120s).")
        except subprocess.CalledProcessError as e:
            logger.error("ffmpeg hatası: %s", e.stderr.decode(errors='replace'))
            raise RuntimeError(f"ffmpeg ses çıkarma hatası: {e.stderr.decode(errors='replace')}")

    @staticmethod
    def transcribe(audio_path: str) -> Dict[str, Any]:
        """
        Whisper ile ses dosyasını metne dönüştürür.

        Returns:
            {
                "text": "tam transkript metni",
                "segments": [...],
                "duration": 120.5
            }
        """
        model = _get_whisper_model()

        result = model.transcribe(
            audio_path,
            language="tr",
            initial_prompt="Ee, ııı, şey, yani, hani, işte, dediki, aslında...",
            verbose=False,
        )

        text = result.get("text", "").strip()
        segments = result.get("segments", [])

        # Toplam süreyi hesapla
        duration = 0.0
        if segments:
            duration = segments[-1].get("end", 0.0)

        logger.info("Transkript tamamlandı. %d segment, %.1f saniye.", len(segments), duration)
        return {
            "text": text,
            "segments": segments,
            "duration": duration,
        }

    @classmethod
    def count_filler_words(cls, text: str) -> Dict[str, Any]:
        """
        Transkriptte dolgu kelimelerini sayar.

        Returns:
            {
                "total": 8,
                "detail": {"ee": 3, "şey": 2, "yani": 3}
            }
        """
        matches = cls.FILLER_PATTERN.findall(text.lower())
        detail: Dict[str, int] = {}
        for match in matches:
            # normalize et
            normalized = match.lower().strip()
            if re.match(r'^e{2,}$', normalized):
                key = "ee"
            elif re.match(r'^ı{2,}$', normalized):
                key = "ııı"
            else:
                key = normalized
            detail[key] = detail.get(key, 0) + 1

        total = sum(detail.values())
        logger.info("Dolgu kelimeleri: toplam %d — %s", total, detail)
        return {"total": total, "detail": detail}

    @classmethod
    def detect_pauses(cls, audio_path: str) -> Dict[str, Any]:
        """
        Librosa ile 1.5 saniyeden uzun sessizlikleri tespit eder.

        Returns:
            {
                "pause_count": 5,
                "total_silence_sec": 12.3,
                "pause_durations": [1.8, 2.1, ...]
            }
        """
        import librosa

        y, sr = librosa.load(audio_path, sr=16000, mono=True)

        # Konuşma segmentlerini bul (sessiz olmayanlar)
        intervals = librosa.effects.split(y, top_db=cls.SILENCE_TOP_DB)

        pause_durations = []
        for i in range(1, len(intervals)):
            # Önceki segmentin bitişi ile sonrakinin başlangıcı arasındaki boşluk
            gap_start = intervals[i - 1][1]
            gap_end = intervals[i][0]
            gap_sec = (gap_end - gap_start) / sr

            if gap_sec >= cls.PAUSE_THRESHOLD_SEC:
                pause_durations.append(round(gap_sec, 2))

        total_silence = round(sum(pause_durations), 2)
        logger.info("Duraksama tespiti: %d adet, toplam %.1f saniye",
                     len(pause_durations), total_silence)
        return {
            "pause_count": len(pause_durations),
            "total_silence_sec": total_silence,
            "pause_durations": pause_durations,
        }

    @staticmethod
    def calculate_speech_rate(text: str, duration_sec: float) -> float:
        """
        Konuşma hızını kelime/dakika (WPM) olarak hesaplar.

        Returns:
            Kelime/dakika değeri (float)
        """
        if duration_sec <= 0:
            return 0.0

        word_count = len(text.split())
        wpm = round(word_count / (duration_sec / 60.0), 2)
        logger.info("Konuşma hızı: %d kelime / %.0f saniye = %.1f WPM",
                     word_count, duration_sec, wpm)
        return wpm


# ============================================================================
#  ÖZGÜVEN SKORU
# ============================================================================

def calculate_confidence_score(
    eye_contact_pct: float,
    stress_pct: float,
    speech_rate_wpm: float,
    filler_word_count: int,
    pause_count: int,
) -> float:
    """
    Ağırlıklı formül ile özgüven skoru hesaplar (0-100 arası).

    Formül:
        confidence = (
            0.30 × göz_teması_pct +
            0.25 × (100 - stres_pct) +
            0.20 × konuşma_hızı_skoru +
            0.15 × (100 - dolgu_kelime_penaltı) +
            0.10 × (100 - duraksama_penaltı)
        )
    """
    # Konuşma hızı skoru: 120-160 WPM arası ideal → 100 puan
    if 120 <= speech_rate_wpm <= 160:
        speech_score = 100.0
    elif speech_rate_wpm < 120:
        speech_score = max(0, 100 - (120 - speech_rate_wpm) * 1.5)
    else:
        speech_score = max(0, 100 - (speech_rate_wpm - 160) * 1.5)

    # Dolgu kelime penaltısı: her biri -3 puan
    filler_penalty = min(100, filler_word_count * 3)

    # Duraksama penaltısı: her biri -5 puan
    pause_penalty = min(100, pause_count * 5)

    # Stres yüzdesi normalize (DeepFace toplamda max ~400 olabilir)
    normalized_stress = min(100, stress_pct)

    confidence = (
        0.30 * min(100, eye_contact_pct)
        + 0.25 * (100 - normalized_stress)
        + 0.20 * speech_score
        + 0.15 * (100 - filler_penalty)
        + 0.10 * (100 - pause_penalty)
    )

    confidence = round(max(0, min(100, confidence)), 2)
    logger.info("Özgüven skoru: %.1f%%", confidence)
    return confidence


# ============================================================================
#  ANA PIPELINE
# ============================================================================

def run_full_analysis(
    file_path: str,
    interview_id: str,
    file_type: str = "video",
) -> None:
    """
    Tüm analiz pipeline'ını çalıştırır (BackgroundTask olarak çağrılır).

    Bu fonksiyon senkrondur — BackgroundTasks senkron fonksiyonları
    ayrı bir thread'de çalıştırır.

    Args:
        file_path: Video veya ses dosyasının yolu
        interview_id: Mülakatın ID'si
        file_type: "video" veya "audio"
    """
    from app.core.config import settings

    logger.info("=== Analiz başlatılıyor: interview_id=%s, dosya=%s ===",
                interview_id, file_path)

    # Durumu "processing" olarak güncelle
    _update_analysis_status(interview_id, "processing")

    try:
        audio_path = file_path
        frames = []

        # --- Video işleme ---
        if file_type == "video":
            logger.info("Video karelerini çıkarıyorum...")
            frames = VideoAnalyzer.extract_frames(file_path, fps=settings.ANALYSIS_FPS)

            logger.info("Video'dan ses çıkarıyorum...")
            audio_path = AudioAnalyzer.extract_audio_from_video(file_path)

        # --- Duygu Analizi ---
        emotion_result = {"distribution": {}, "dominant": "unknown", "stress_pct": 0.0}
        if frames:
            logger.info("DeepFace duygu analizi başlıyor...")
            emotion_result = VideoAnalyzer.analyze_emotions(frames)

        # --- Göz Teması Analizi ---
        eye_result = {"eye_contact_pct": 0.0, "blink_count": 0, "total_frames_analyzed": 0}
        if frames:
            logger.info("MediaPipe göz teması analizi başlıyor...")
            eye_result = VideoAnalyzer.analyze_eye_contact(frames)
            
        # RAM Tüketimini Azaltmak İçin Kareleri Bellekten Sil
        frames.clear()

        # --- Whisper Transkript ---
        logger.info("Whisper transkript başlıyor...")
        transcript_result = AudioAnalyzer.transcribe(audio_path)

        # --- Dolgu Kelimeleri ---
        filler_result = AudioAnalyzer.count_filler_words(transcript_result["text"])

        # --- Duraksama Tespiti ---
        logger.info("Librosa duraksama tespiti başlıyor...")
        pause_result = AudioAnalyzer.detect_pauses(audio_path)

        # --- Konuşma Hızı ---
        speech_rate = AudioAnalyzer.calculate_speech_rate(
            transcript_result["text"],
            transcript_result["duration"],
        )

        # --- Özgüven Skoru ---
        confidence = calculate_confidence_score(
            eye_contact_pct=eye_result["eye_contact_pct"],
            stress_pct=emotion_result["stress_pct"],
            speech_rate_wpm=speech_rate,
            filler_word_count=filler_result["total"],
            pause_count=pause_result["pause_count"],
        )

        # --- Sonuçları kaydet ---
        analytics_data = {
            "interview_id": interview_id,
            "confidence_pct": confidence,
            "eye_contact_pct": eye_result["eye_contact_pct"],
            "pause_count": pause_result["pause_count"],
            "filler_word_count": filler_result["total"],
            "filler_words_detail": filler_result["detail"],
            "speech_rate_wpm": speech_rate,
            "dominant_emotion": emotion_result["dominant"],
            "emotion_distribution": emotion_result["distribution"],
            "transcript": transcript_result["text"],
            "analysis_status": "completed",
        }

        save_analytics_to_db(analytics_data)
        logger.info("=== Analiz tamamlandı: interview_id=%s ===", interview_id)

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error("Analiz hatası (interview_id=%s): %s\n%s",
                      interview_id, error_msg, traceback.format_exc())
        _update_analysis_status(interview_id, "failed", error_msg)

    finally:
        # Geçici dosyaları temizle
        _cleanup_temp_files(file_path)


# ============================================================================
#  SUPABASE KAYIT
# ============================================================================

def _convert_to_native(obj):
    """NumPy veri tiplerini standart Python tiplerine dönüştürür (JSON için)."""
    if isinstance(obj, np.generic):
        return obj.item()
    elif isinstance(obj, dict):
        return {k: _convert_to_native(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_to_native(v) for v in obj]
    elif isinstance(obj, tuple):
        return tuple(_convert_to_native(v) for v in obj)
    return obj


def save_analytics_to_db(data: Dict[str, Any]) -> None:
    """
    Analiz sonuçlarını Supabase interview_analytics tablosuna kaydeder.
    """
    from app.core.database import supabase

    if not supabase:
        logger.error("Supabase bağlantısı yok, analiz kaydedilemedi!")
        return

    try:
        raw_record = {
            "interview_id": data["interview_id"],
            "confidence_pct": data.get("confidence_pct", 0),
            "eye_contact_pct": data.get("eye_contact_pct", 0),
            "pause_count": data.get("pause_count", 0),
            "filler_word_count": data.get("filler_word_count", 0),
            "filler_words_detail": data.get("filler_words_detail", {}),
            "speech_rate_wpm": data.get("speech_rate_wpm", 0),
            "dominant_emotion": data.get("dominant_emotion", "neutral"),
            "emotion_distribution": data.get("emotion_distribution", {}),
            "transcript": data.get("transcript", ""),
            "analysis_status": data.get("analysis_status", "completed"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        record = _convert_to_native(raw_record)

        # Mevcut kayıt varsa güncelle, yoksa yeni ekle
        existing = (
            supabase.table("interview_analytics")
            .select("id")
            .eq("interview_id", data["interview_id"])
            .execute()
        )

        if existing.data:
            supabase.table("interview_analytics") \
                .update(record) \
                .eq("interview_id", data["interview_id"]) \
                .execute()
            logger.info("Analiz güncellendi: interview_id=%s", data["interview_id"])
        else:
            supabase.table("interview_analytics") \
                .insert(record) \
                .execute()
            logger.info("Analiz kaydedildi: interview_id=%s", data["interview_id"])

    except Exception as e:
        logger.error("Supabase kayıt hatası: %s", e, exc_info=True)
        raise


def _update_analysis_status(
    interview_id: str,
    status: str,
    error_message: str = None,
) -> None:
    """Analiz durumunu günceller veya yeni kayıt oluşturur."""
    from app.core.database import supabase

    if not supabase:
        return

    try:
        record = {
            "analysis_status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if error_message:
            record["error_message"] = error_message

        existing = (
            supabase.table("interview_analytics")
            .select("id")
            .eq("interview_id", interview_id)
            .execute()
        )

        if existing.data:
            supabase.table("interview_analytics") \
                .update(record) \
                .eq("interview_id", interview_id) \
                .execute()
        else:
            record["interview_id"] = interview_id
            supabase.table("interview_analytics") \
                .insert(record) \
                .execute()

    except Exception as e:
        logger.error("Durum güncelleme hatası: %s", e)


def _cleanup_temp_files(file_path: str) -> None:
    """Geçici dosyaları temizler."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug("Temp dosya silindi: %s", file_path)

        # Eğer .wav versiyonu da oluştuysa onu da sil
        wav_path = file_path.rsplit(".", 1)[0] + ".wav"
        if os.path.exists(wav_path) and wav_path != file_path:
            os.remove(wav_path)
            logger.debug("Temp ses dosyası silindi: %s", wav_path)
    except Exception as e:
        logger.warning("Temp dosya temizleme hatası: %s", e)
