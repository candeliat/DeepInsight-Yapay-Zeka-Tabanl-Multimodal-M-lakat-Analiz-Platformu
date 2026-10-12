"""
Supabase istemcileri.

- `supabase`: ASENKRON istemci (AsyncClient). Servislerin büyük kısmı bunu kullanır;
  sorgular `await run(query)` ile çalıştırılır. Önceden senkron istemci `async def`
  fonksiyonların içinden çağrılıyordu: her veritabanı çağrısı event loop'u bloke ediyor,
  eşzamanlı istekler sıraya giriyordu (ölçüm: 6 paralel istek tek isteğin 6-9,5 katı).
- `sync_supabase`: iş parçacığına özel SENKRON istemci vekili. Yalnızca senkron yazılmış
  modüller (progress_service, pilot_service, video analizi arka plan işi) içindir; bunlar
  asenkron koddan `asyncio.to_thread` ile çağrılır. Her iş parçacığı kendi istemcisini (ve
  HTTP/2 bağlantısını) kullanır — paylaşılan senkron istemci iş parçacıkları arasında
  kullanılınca bağlantı kopuyordu (ReadError -> 503).

URL veya anahtar eksikse ikisi de None olur ve uygulama yine ayağa kalkar.
"""
import inspect
import logging
import threading
from typing import Any

from supabase import AsyncClient, Client, create_client
from supabase.lib.client_options import AsyncClientOptions

from app.core.config import settings

logger = logging.getLogger(__name__)


def _configured() -> bool:
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        logger.warning(
            "SUPABASE_URL veya SUPABASE_KEY eksik: veritabanı özellikleri devre dışı. "
            "Değerleri .env dosyasına ekleyip sunucuyu yeniden başlatın."
        )
        return False
    return True


def _create_async_client() -> AsyncClient | None:
    if not _configured():
        return None
    try:
        # AsyncClient senkron kurulabilir; HTTP bağlantıları ilk istekte açılır.
        client = AsyncClient(settings.SUPABASE_URL, settings.SUPABASE_KEY, AsyncClientOptions())
        logger.info("Supabase (asenkron) istemcisi hazır.")
        return client
    except Exception as e:
        logger.error("Supabase bağlantı hatası: %s", e, exc_info=True)
        return None


class _ThreadLocalClient:
    """Her iş parçacığına kendi senkron Supabase istemcisini veren vekil."""

    def __init__(self) -> None:
        self._local = threading.local()

    def _client(self) -> Client:
        client = getattr(self._local, "client", None)
        if client is None:
            client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            self._local.client = client
        return client

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client(), name)


async def run(query: Any) -> Any:
    """Bir sorgu oluşturucuyu çalıştırır (`await run(supabase.table(...).select(...))`).
    Asenkron istemcide execute() bir coroutine döner ve beklenir; testlerdeki senkron
    sahte istemciler (MagicMock) de aynı çağrıyla çalışır."""
    return await aw(query.execute())


async def aw(value: Any) -> Any:
    """Değer beklenebilirse bekler, değilse olduğu gibi döner (gerçek asenkron çağrılar ve
    testlerdeki senkron sahte fonksiyonlar için ortak çağrı biçimi)."""
    return await value if inspect.isawaitable(value) else value


supabase: AsyncClient | None = _create_async_client()
sync_supabase: _ThreadLocalClient | None = _ThreadLocalClient() if supabase is not None else None
