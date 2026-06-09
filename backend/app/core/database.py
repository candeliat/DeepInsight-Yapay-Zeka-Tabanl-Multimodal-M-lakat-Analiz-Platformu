from supabase import create_client, Client
try:
    from supabase import ClientOptions
except ImportError:
    ClientOptions = None

import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Singleton client — None olabilir (Supabase key'leri eksikse)
supabase: Client | None = None


def _create_supabase_client() -> Client | None:
    """
    Supabase bağlantısını oluşturur.
    URL veya KEY eksikse None döner ve uyarı basar (uygulama yine de ayağa kalkar).
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        print(
            "WARNING: SUPABASE_URL veya SUPABASE_KEY .env dosyasında eksik. "
            "Veritabanı özellikleri devre dışı. "
            "Supabase değerlerini .env dosyasına ekleyip sunucuyu yeniden başlatın."
        )
        return None

    try:
        client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        logger.info("Supabase bağlantısı başarıyla kuruldu.")
        return client
    except Exception as e:
        logger.error("Supabase bağlantı hatası: %s", e, exc_info=True)
        return None

def get_auth_client(token: str) -> Client | None:
    """
    Kullanıcının JWT token'ını kullanarak özel bir Supabase istemcisi oluşturur.
    Bu sayede Row-Level Security (RLS) aşılabilir.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return None
        
    try:
        if ClientOptions:
            return create_client(
                settings.SUPABASE_URL, 
                settings.SUPABASE_KEY,
                options=ClientOptions(headers={"Authorization": f"Bearer {token}"})
            )
        else:
            # Fallback for older versions
            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            client.postgrest.auth(token)
            return client
    except Exception as e:
        logger.error("Supabase auth client hatası: %s", e, exc_info=True)
        return None

supabase = _create_supabase_client()
