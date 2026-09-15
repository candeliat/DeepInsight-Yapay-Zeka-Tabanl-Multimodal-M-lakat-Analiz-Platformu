import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.database import supabase
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


async def fetch_question_pool(role: str, topic: str, difficulty: Optional[str], size: int) -> List[Dict[str, Any]]:
    """
    Mülakat başında (yalnızca `/start`'ta) BİR KEZ çağrılır: role+topic
    (+ difficulty) için soru bankasından en iyi `size` adet eşleşen soruyu
    getirir. Dönen liste `interviews.question_pool` (jsonb) kolonuna yazılır
    ve sonraki her tur (`/chat`, `/chat/stream`) mevcut `questions_asked`
    sayacını index olarak kullanarak sırayla tüketir — bu yüzden bir "hangi
    sorular zaten soruldu" tablosuna/kolonuna ayrıca gerek yoktur.

    Best-effort: embedding ya da RPC çağrısı başarısız olursa, ya da banka bu
    rol/konu/zorluk için yeterince benzer soru içermiyorsa BOŞ ya da kısmi bir
    liste döner. Mülakat bu yüzden ASLA kesintiye uğramaz — route katmanı,
    havuzda karşılığı olmayan her index için otomatik olarak LLM'in
    tam-üretim akışına (`llm_service.get_next_question`) düşer.
    """
    if not supabase or size <= 0:
        return []

    # role+topic (+ difficulty) tek bir sorgu embedding'ine gömülür — role/topic
    # serbest metin olduğu için SQL tarafında tam eşleşme değil, semantik
    # benzerlik aranır (bkz. sql/001_question_bank.sql'deki match_questions).
    query_text = f"{role} pozisyonu için {topic} konusunda teknik mülakat sorusu"

    try:
        query_embedding = await llm_service.embed_text(query_text, input_type="query")
    except Exception:
        logger.warning(
            "[question_bank_service] Embedding alınamadı (role=%s, topic=%s) — banka bu mülakat için atlanıyor.",
            role, topic, exc_info=True,
        )
        return []

    try:
        result = supabase.rpc(
            "match_questions",
            {
                "query_embedding": query_embedding,
                "filter_difficulty": difficulty,
                "match_count": size,
            },
        ).execute()
    except Exception:
        logger.warning(
            "[question_bank_service] match_questions RPC başarısız (role=%s, topic=%s) — banka bu mülakat için atlanıyor.",
            role, topic, exc_info=True,
        )
        return []

    rows = result.data or []
    pool = [
        {"id": row["id"], "question_text": row["question_text"], "similarity": row["similarity"]}
        for row in rows
        if row.get("similarity") is not None and row["similarity"] >= settings.QUESTION_BANK_MIN_SIMILARITY
    ]
    logger.info(
        "[question_bank_service] role=%s topic=%s difficulty=%s -> %d/%d aday eşik (%.2f) üzerinde.",
        role, topic, difficulty, len(pool), len(rows), settings.QUESTION_BANK_MIN_SIMILARITY,
    )
    return pool
