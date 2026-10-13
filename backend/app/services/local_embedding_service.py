"""
Yerel (API'siz) embedding fallback — soru bankası retrieval'i için birincil
`nvidia/nemotron-3-embed-1b` API modeli kota/ağ hatasıyla çöktüğünde devreye
girer (bkz. question_bank_service.fetch_question_pool).

`intfloat/multilingual-e5-base` kullanılıyor: çok dilli (Türkçe dahil),
standart XLM-RoBERTa mimarili (özel/remote kod gerektirmez — daha kırılgan
"trust_remote_code" modelleriyle denenen `newmindai/TurkEmbed4Retrieval`
üretim ortamındaki transformers/torch sürümleriyle bir uyumsuzluk yüzünden
çöktü), sentence-transformers uyumlu, 768 boyutlu, geniş kullanımlı bir
model. API modelinden TAMAMEN FARKLI bir vektör uzayı üretir — bu yüzden
`question_bank.embedding` ile KIYASLANAMAZ, ayrı bir kolonda
(`embedding_local`) ve ayrı bir RPC'de (`match_questions_local`) tutulur.

E5 aile modelleri ASİMETRİKTİR (llm_service.embed_text'teki NVIDIA modeli
gibi): arama sorgusu "query: ", bankaya kaydedilen soru metni "passage: "
öneki ile encode edilmelidir (bkz. model kartı).

`whisper_service.py` ile aynı thread-safe lazy-singleton deseni: model ilk
kullanıldığında diskten (ya da ilk seferinde Hugging Face'ten) yüklenir,
sonraki her çağrı aynı process-wide instance'ı paylaşır.
"""

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

_MODEL_NAME = "intfloat/multilingual-e5-base"

_model = None
_lock = threading.Lock()
_warming = False


def get_local_embedding_model():
    """
    Yerel embedding modelini process içinde tek seferlik yükler ve döner.
    Thread-safe: BackgroundTasks (thread pool) ve event loop'tan eşzamanlı
    çağrılsa bile model yalnızca bir kez yüklenir.
    """
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                logger.info("Yerel embedding modeli '%s' yükleniyor (paylaşılan singleton)...", _MODEL_NAME)
                _model = SentenceTransformer(_MODEL_NAME)
                logger.info("Yerel embedding modeli yüklendi.")
    return _model


def embed_text_local(text: str, input_type: str = "query") -> list[float]:
    """
    Verilen metnin yerel modelle hesaplanmış embedding vektörünü döner.
    `input_type`: "query" (arama sorgusu) veya "passage" (bankaya kaydedilen
    soru metni) — bkz. modül başındaki E5 asimetri notu.

    Senkron/CPU-bound bir çağrıdır — `question_bank_service` ve
    `question_bank_admin_service` bunu `asyncio.to_thread` ile event loop'u
    bloklamadan çağırır.
    """
    model = get_local_embedding_model()
    prefixed = f"{input_type}: {text}"
    return model.encode(prefixed, normalize_embeddings=True).tolist()


def _warm() -> None:
    global _warming
    try:
        get_local_embedding_model()
    except Exception:
        logger.warning("Yerel embedding modeli arka planda yüklenemedi.", exc_info=True)
    finally:
        _warming = False


def embed_text_local_if_ready(text: str, input_type: str = "query") -> Optional[list[float]]:
    """
    Model bellekteyse `embed_text_local` ile aynı; değilse modeli arka planda yüklemeye
    başlatıp hemen None döner. Soğuk yükleme (torch + model) bu makinede ~75 sn sürdüğü
    için istek yolunda (soru ekleme, mülakat başlatma) beklenmez; boş kalan
    `embedding_local` alanları scripts/backfill_local_embeddings.py ile doldurulur.
    """
    global _warming
    if _model is None:
        with _lock:
            if _model is None and not _warming:
                _warming = True
                threading.Thread(target=_warm, name="local-embedding-warmup", daemon=True).start()
        if _model is None:
            return None
    return embed_text_local(text, input_type)
