import os
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

if "GOOGLE_API_KEY" in os.environ:
    del os.environ["GOOGLE_API_KEY"]


class Settings:
    """
    Centralized configuration management for the application.
    Reads from environment variables.
    """
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "small")
    TEMP_UPLOAD_DIR: str = os.getenv("TEMP_UPLOAD_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp_uploads"))
    ANALYSIS_FPS: int = int(os.getenv("ANALYSIS_FPS", "1"))

settings = Settings()

if settings.GEMINI_API_KEY:
    masked_key = settings.GEMINI_API_KEY[:5] + "..." + settings.GEMINI_API_KEY[-3:]
    logger.info("Gemini API Key yüklendi. (%s, uzunluk: %d)", masked_key, len(settings.GEMINI_API_KEY))
else:
    logger.warning("GEMINI_API_KEY eksik veya .env dosyası okunamadı!")
