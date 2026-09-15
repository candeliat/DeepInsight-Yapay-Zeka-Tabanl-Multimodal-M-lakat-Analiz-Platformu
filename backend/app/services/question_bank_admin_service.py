"""
Soru bankası İÇERİK YÖNETİMİ (CRUD) — `question_bank_service.py`'deki canlı
mülakat RETRIEVAL mantığından (fetch_question_pool vb.) kasıtlı olarak ayrı
tutulur: bu modül dashboard'daki "Soru Bankası" yönetim sayfası tarafından
kullanılır, mülakat akışının kendisi tarafından DEĞİL.

Amaç: soru eklemek/düzenlemek için artık Supabase SQL Editor'e girip elle
INSERT yazmaya ya da seed script'i çalıştırmaya gerek kalmasın — embedding
otomatik olarak burada hesaplanır.
"""
import logging
import uuid
from typing import Any, Dict, List, Optional

from app.core.database import supabase
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

_SELECT_COLUMNS = "id, role, topic, difficulty, question_text, tags, family_id, times_served, is_active, created_at"


def _strip_embedding(row: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(row)
    row.pop("embedding", None)
    return row


async def list_questions() -> List[Dict[str, Any]]:
    if not supabase:
        return []
    result = (
        supabase.table("question_bank")
        .select(_SELECT_COLUMNS)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def create_question(
    role: str,
    topic: str,
    difficulty: Optional[str],
    question_text: str,
    tags: List[str],
    family_id: Optional[str],
    new_family: bool,
) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")

    resolved_family_id = str(uuid.uuid4()) if new_family else family_id

    # "passage" — bankaya kaydedilen soru metni olarak encode edilir (arama
    # sorgusu değil), bkz. llm_service.embed_text ve question_bank_service.py.
    embedding = await llm_service.embed_text(question_text, input_type="passage")

    record = {
        "role": role,
        "topic": topic,
        "difficulty": difficulty,
        "question_text": question_text,
        "tags": tags,
        "family_id": resolved_family_id,
        "embedding": embedding,
    }
    result = supabase.table("question_bank").insert(record).execute()
    if not result.data:
        raise RuntimeError("Soru eklenemedi")

    inserted_id = result.data[0]["id"]
    full_row = supabase.table("question_bank").select(_SELECT_COLUMNS).eq("id", inserted_id).execute()
    return full_row.data[0] if full_row.data else _strip_embedding(result.data[0])


async def update_question(question_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")

    record = {k: v for k, v in updates.items() if v is not None}
    if not record:
        raise ValueError("Güncellenecek alan yok")

    if "question_text" in record:
        record["embedding"] = await llm_service.embed_text(record["question_text"], input_type="passage")

    result = supabase.table("question_bank").update(record).eq("id", question_id).execute()
    if not result.data:
        raise ValueError("Soru bulunamadı")

    full_row = supabase.table("question_bank").select(_SELECT_COLUMNS).eq("id", question_id).execute()
    return full_row.data[0] if full_row.data else _strip_embedding(result.data[0])


async def delete_question(question_id: str) -> None:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    supabase.table("question_bank").delete().eq("id", question_id).execute()


async def list_gaps() -> List[Dict[str, Any]]:
    if not supabase:
        return []
    result = (
        supabase.table("question_bank_gaps")
        .select("*")
        .order("miss_count", desc=True)
        .execute()
    )
    return result.data or []
