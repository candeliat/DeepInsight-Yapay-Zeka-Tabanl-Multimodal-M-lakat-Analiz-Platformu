"""
Soru bankası İÇERİK YÖNETİMİ (CRUD) — `question_bank_service.py`'deki canlı
mülakat RETRIEVAL mantığından (fetch_question_pool vb.) kasıtlı olarak ayrı
tutulur: bu modül dashboard'daki "Soru Bankası" yönetim sayfası tarafından
kullanılır, mülakat akışının kendisi tarafından DEĞİL.

Amaç: soru eklemek/düzenlemek için artık Supabase SQL Editor'e girip elle
INSERT yazmaya ya da seed script'i çalıştırmaya gerek kalmasın — embedding
otomatik olarak burada hesaplanır.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import supabase
from app.services.llm_service import llm_service
from app.services.local_embedding_service import embed_text_local

logger = logging.getLogger(__name__)

_SELECT_COLUMNS = "id, role, topic, difficulty, question_text, tags, family_id, times_served, is_active, created_at, org_id"


def _scope(query, org_id: Optional[str]):
    """
    Her sorgu tek bir kapsama sabitlenir: org_id verilirse yalnızca o kurumun
    soruları, verilmezse yalnızca GLOBAL (org_id null) sorular. Böylece bir
    kurum başka bir kurumun (ya da global) sorusunu id tahmin ederek bile
    okuyamaz, değiştiremez, silemez.
    """
    return query.eq("org_id", org_id) if org_id else query.is_("org_id", "null")


def _assert_family_in_scope(family_id: Optional[str], org_id: Optional[str]) -> None:
    """Başka bir kapsamdaki (kurum/global) bir aileye soru eklenmesini engeller —
    aksi halde aile zinciri üzerinden kapsamlar arası sızıntı olurdu."""
    if not family_id:
        return
    members = supabase.table("question_bank").select("org_id").eq("family_id", family_id).execute().data or []
    if any((m.get("org_id") or None) != (org_id or None) for m in members):
        raise ValueError("Bu aile bu kapsamda bulunamadı")


def _strip_embedding(row: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(row)
    row.pop("embedding", None)
    row.pop("embedding_local", None)
    return row


async def _embed_local_best_effort(question_text: str) -> Optional[List[float]]:
    """
    Yerel fallback embedding'i hesaplar (bkz. local_embedding_service.py).
    Best-effort: model henüz yüklenmemiş/kurulmamışsa ya da hata verirse
    None döner — asıl yazma işlemini (API embedding'iyle) ASLA engellemez,
    yalnızca o satır için `embedding_local` boş kalır (sonradan backfill
    script'iyle doldurulabilir, bkz. scripts/backfill_local_embeddings.py).
    """
    try:
        return await asyncio.to_thread(embed_text_local, question_text, "passage")
    except Exception:
        logger.warning(
            "[question_bank_admin_service] Yerel embedding hesaplanamadı — embedding_local boş bırakılıyor.",
            exc_info=True,
        )
        return None


async def list_questions(org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    result = (
        _scope(supabase.table("question_bank").select(_SELECT_COLUMNS), org_id)
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
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")

    if not new_family:
        _assert_family_in_scope(family_id, org_id)
    resolved_family_id = str(uuid.uuid4()) if new_family else family_id

    # "passage" — bankaya kaydedilen soru metni olarak encode edilir (arama
    # sorgusu değil), bkz. llm_service.embed_text ve question_bank_service.py.
    embedding = await llm_service.embed_text(question_text, input_type="passage")
    # Yerel fallback embedding'i HER yazımda hesaplanır (lazy değil) ki
    # embedding_local her zaman API'nin ulaşılamadığı bir anda gerçek bir
    # fallback olarak hazır olsun (bkz. question_bank_service.fetch_question_pool).
    embedding_local = await _embed_local_best_effort(question_text)

    record = {
        "role": role,
        "topic": topic,
        "difficulty": difficulty,
        "question_text": question_text,
        "tags": tags,
        "family_id": resolved_family_id,
        "embedding": embedding,
        "embedding_local": embedding_local,
    }
    if org_id:
        record["org_id"] = org_id
    result = supabase.table("question_bank").insert(record).execute()
    if not result.data:
        raise RuntimeError("Soru eklenemedi")

    inserted_id = result.data[0]["id"]
    full_row = supabase.table("question_bank").select(_SELECT_COLUMNS).eq("id", inserted_id).execute()
    return full_row.data[0] if full_row.data else _strip_embedding(result.data[0])


async def update_question(question_id: str, updates: Dict[str, Any], org_id: Optional[str] = None) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")

    record = {k: v for k, v in updates.items() if v is not None}
    if not record:
        raise ValueError("Güncellenecek alan yok")

    if "question_text" in record:
        record["embedding"] = await llm_service.embed_text(record["question_text"], input_type="passage")
        # Yerel embedding'i de tazele — best-effort: başarısız olursa mevcut
        # embedding_local değerine dokunulmaz (None ile üzerine yazılmaz).
        embedding_local = await _embed_local_best_effort(record["question_text"])
        if embedding_local is not None:
            record["embedding_local"] = embedding_local

    result = _scope(supabase.table("question_bank").update(record).eq("id", question_id), org_id).execute()
    if not result.data:
        raise ValueError("Soru bulunamadı")

    full_row = supabase.table("question_bank").select(_SELECT_COLUMNS).eq("id", question_id).execute()
    return full_row.data[0] if full_row.data else _strip_embedding(result.data[0])


async def delete_question(question_id: str, org_id: Optional[str] = None) -> None:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    _scope(supabase.table("question_bank").delete().eq("id", question_id), org_id).execute()


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


# --------------------------------------------------------------------------
# Soru önerisi (candidate) kuyruğu — hibrit LLM üretimi + insan onayı.
# Hiçbir öneri buradan doğrudan `question_bank`'a girmez; yalnızca
# `approve_candidate` ile (bir insan onayladıktan sonra) gerçek bir soruya
# dönüşür. Bkz. sql/004_question_candidates.sql ve proje notları.
# --------------------------------------------------------------------------

async def generate_candidates_for_gaps(limit: int = 5) -> List[Dict[str, Any]]:
    """
    En yüksek `miss_count`'lu boşluklar için birer soru ÖNERİSİ üretip
    `question_bank_candidates`'e 'pending' olarak ekler. Best-effort: bir
    boşluk için üretim başarısız olursa o boşluk atlanır, diğerleri
    denenmeye devam eder — tek bir modelin çökmesi tüm toplu üretimi
    engellemez.
    """
    if not supabase:
        return []

    gaps_result = (
        supabase.table("question_bank_gaps").select("*").order("miss_count", desc=True).limit(limit).execute()
    )
    gaps = gaps_result.data or []

    created: List[Dict[str, Any]] = []
    for gap in gaps:
        try:
            question_text = await llm_service.generate_question_candidate(
                gap["role"], gap["topic"], gap.get("difficulty"),
            )
            record = {
                "role": gap["role"],
                "topic": gap["topic"],
                "difficulty": gap.get("difficulty"),
                "question_text": question_text,
                "source_gap_id": gap["id"],
                "status": "pending",
            }
            result = supabase.table("question_bank_candidates").insert(record).execute()
            if result.data:
                created.append(result.data[0])
        except Exception:
            logger.warning(
                "[question_bank_admin_service] Boşluk için öneri üretilemedi (gap_id=%s, role=%s, topic=%s).",
                gap.get("id"), gap.get("role"), gap.get("topic"), exc_info=True,
            )
            continue

    return created


async def list_candidates(status: str = "pending") -> List[Dict[str, Any]]:
    if not supabase:
        return []
    result = (
        supabase.table("question_bank_candidates")
        .select("*")
        .eq("status", status)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def approve_candidate(candidate_id: str) -> Dict[str, Any]:
    """Bir öneriyi gerçek bir soruya dönüştürür (embedding hesaplanıp
    `question_bank`'a eklenir) ve öneriyi 'approved' olarak işaretler."""
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")

    cand_result = supabase.table("question_bank_candidates").select("*").eq("id", candidate_id).execute()
    if not cand_result.data:
        raise ValueError("Öneri bulunamadı")
    candidate = cand_result.data[0]

    created = await create_question(
        role=candidate["role"],
        topic=candidate["topic"],
        difficulty=candidate.get("difficulty"),
        question_text=candidate["question_text"],
        tags=["ai-onerisi"],
        family_id=None,
        new_family=False,
    )

    supabase.table("question_bank_candidates").update({
        "status": "approved",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", candidate_id).execute()

    return created


async def reject_candidate(candidate_id: str) -> None:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    supabase.table("question_bank_candidates").update({
        "status": "rejected",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", candidate_id).execute()
