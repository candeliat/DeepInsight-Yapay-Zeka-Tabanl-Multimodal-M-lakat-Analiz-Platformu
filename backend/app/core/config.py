import os
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)


class Settings:
    """
    Centralized configuration management for the application.
    Reads from environment variables.
    """
    # Mülakat LLM motoru için OpenAI-uyumlu herhangi bir sağlayıcı (OpenRouter,
    # NVIDIA build.nvidia.com, vb.) kullanılabilir — base_url + model isimleri
    # sağlayıcıya göre değişir (bkz. llm_service.py FREE_MODELS).
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "small")
    TEMP_UPLOAD_DIR: str = os.getenv("TEMP_UPLOAD_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp_uploads"))
    ANALYSIS_FPS: int = int(os.getenv("ANALYSIS_FPS", "1"))

    # --- LLM Mülakat Motoru ---
    MAX_INTERVIEW_QUESTIONS: int = int(os.getenv("MAX_INTERVIEW_QUESTIONS", "5"))
    LLM_REQUEST_TIMEOUT: float = float(os.getenv("LLM_REQUEST_TIMEOUT", "60"))
    # Varsayılan olarak KAPALI: yanlışlıkla ücretli model çağrısı yapıp maliyet oluşmasını engeller.
    # Açmak için .env dosyasına ENABLE_PAID_MODEL_FALLBACK=true ekleyin.
    ENABLE_PAID_MODEL_FALLBACK: bool = os.getenv("ENABLE_PAID_MODEL_FALLBACK", "false").lower() == "true"

settings = Settings()

if settings.LLM_API_KEY:
    masked_key = settings.LLM_API_KEY[:5] + "..." + settings.LLM_API_KEY[-3:]
    logger.info("LLM API Key yüklendi (base_url=%s). (%s, uzunluk: %d)", settings.LLM_BASE_URL, masked_key, len(settings.LLM_API_KEY))
else:
    logger.warning("LLM_API_KEY eksik veya .env dosyası okunamadı! LLM mülakat motoru çalışmayacak.")
