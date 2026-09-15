import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.database import supabase
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

# Aile zincirlerini zorluk sırasına göre dizmek için (bkz. _fetch_family_chain).
# Tanınmayan/boş zorluk en kolay kabul edilir.
_DIFFICULTY_RANK = {"JUNIOR": 0, "ORTA": 1, "UZMAN": 2}


async def fetch_question_pool(role: str, topic: str, difficulty: Optional[str], size: int) -> List[Dict[str, Any]]:
    """
    Mülakat başında (yalnızca `/start`'ta) BİR KEZ çağrılır: role+topic
    (+ difficulty) için soru bankasından en iyi `size` adet eşleşen soruyu
    getirir. Dönen liste `interviews.question_pool` (jsonb) kolonuna yazılır
    ve sonraki her tur (`/chat`, `/chat/stream`) mevcut `questions_asked`
    sayacını index olarak kullanarak sırayla tüketir — bu yüzden bir "hangi
    sorular zaten soruldu" tablosuna/kolonuna ayrıca gerek yoktur.

    İki yan etkisi vardır (ikisi de best-effort, mülakatı ASLA engellemez):
      - Seçilen soruların `times_served` sayacı artırılır (exposure control —
        aynı popüler sorunun her mülakatta tekrar seçilmesini hafifçe
        cezalandırmak için, bkz. `_rank_with_exposure_penalty`).
      - Havuz `size`'ın altında kalırsa (banka bu kombinasyon için
        yetersizse), bu "boşluk" `question_bank_gaps` tablosuna kaydedilir —
        ileride hangi içeriğin gerçekten eksik olduğuna dair gerçek kullanım
        verisi sağlar (bkz. proje notları).

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

    # Exposure-control ile yeniden sıralayabilmek için `size`'dan daha fazla
    # aday çekilir — yoksa cezalandırılan bir sorunun yerini alacak "ikinci
    # en iyi" bir aday havuzu olmaz.
    candidate_count = min(size * settings.QUESTION_BANK_CANDIDATE_POOL_MULTIPLIER, 30)

    try:
        result = supabase.rpc(
            "match_questions",
            {
                "query_embedding": query_embedding,
                "filter_difficulty": difficulty,
                "match_count": candidate_count,
            },
        ).execute()
    except Exception:
        logger.warning(
            "[question_bank_service] match_questions RPC başarısız (role=%s, topic=%s) — banka bu mülakat için atlanıyor.",
            role, topic, exc_info=True,
        )
        return []

    rows = result.data or []
    relevant_rows = [
        row for row in rows
        if row.get("similarity") is not None and row["similarity"] >= settings.QUESTION_BANK_MIN_SIMILARITY
    ]
    ranked_rows = _rank_with_exposure_penalty(relevant_rows)
    selected_rows = await _pack_pool_with_family_chains(ranked_rows, size)

    pool = [
        {"id": row["id"], "question_text": row["question_text"], "similarity": row.get("similarity")}
        for row in selected_rows
    ]

    logger.info(
        "[question_bank_service] role=%s topic=%s difficulty=%s -> %d/%d aday eşik (%.2f) üzerinde, %d tanesi seçildi.",
        role, topic, difficulty, len(relevant_rows), len(rows), settings.QUESTION_BANK_MIN_SIMILARITY, len(pool),
    )

    if len(pool) < size:
        await _log_question_bank_gap(role, topic, difficulty, missing_count=size - len(pool))

    if selected_rows:
        await _increment_times_served([row["id"] for row in selected_rows])

    return pool


async def _pack_pool_with_family_chains(ranked_rows: List[Dict[str, Any]], size: int) -> List[Dict[str, Any]]:
    """
    Sıralanmış adaylardan `size` uzunluğunda nihai havuzu oluşturur. Bir aday
    bir aileye (`family_id`) aitse ve o aile bu havuzda daha önce hiç
    kullanılmadıysa, tek satır yerine o ailenin EŞLEŞEN zorluktan başlayıp
    daha zoruna doğru giden TÜM varyantları ardışık slotlara paketlenir —
    gerçek mülakatların "tek bir konuyu derinleştirme" desenini statik olarak
    taklit eder (bkz. modül başındaki genel not). Aile üyesi olmayan adaylar
    olduğu gibi eklenir.

    Not: Bu fonksiyon `/start` sırasında TEK SEFERE çalışır — sonraki turlar
    (`/chat`) yalnızca burada üretilen sabit listeyi index'e göre tüketir,
    adayın cevap kalitesine göre gerçek zamanlı bir dallanma YAPMAZ (bkz.
    proje notları: bu kasıtlı bir kapsam kararı, ek LLM çağrısı gerektirmez).
    """
    selected: List[Dict[str, Any]] = []
    used_ids: set = set()
    used_family_ids: set = set()

    for row in ranked_rows:
        if len(selected) >= size:
            break
        if row["id"] in used_ids:
            continue

        family_id = row.get("family_id")
        if family_id and family_id not in used_family_ids:
            used_family_ids.add(family_id)
            chain = await _fetch_family_chain(family_id, start_difficulty=row.get("difficulty"))
            if not chain:
                # Zincir çekilemedi/boş döndü — en azından eşleşen tek soruyu kullan.
                chain = [row]
            for member in chain:
                if len(selected) >= size or member["id"] in used_ids:
                    continue
                selected.append(member)
                used_ids.add(member["id"])
        else:
            selected.append(row)
            used_ids.add(row["id"])

    return selected


async def _fetch_family_chain(family_id: str, start_difficulty: Optional[str]) -> List[Dict[str, Any]]:
    """
    Bir ailenin, verilen başlangıç zorluğundan (dahil) daha zor ya da eşit
    olan varyantlarını zorluk ARTAN sırada döner. Embedding sıralamasından
    gelmediği için bu satırların `similarity` alanı yoktur (havuz sözlüğünde
    None olarak görünür — yalnızca bilgilendirme amaçlı, akışı etkilemez).

    Best-effort: hata/boş sonuç durumunda boş liste döner — çağıran taraf
    bu durumda eşleşen tek soruya geri düşer (bkz. _pack_pool_with_family_chains).
    """
    if not supabase:
        return []
    try:
        result = (
            supabase.table("question_bank")
            .select("id, question_text, difficulty")
            .eq("family_id", family_id)
            .eq("is_active", True)
            .execute()
        )
    except Exception:
        logger.warning("[question_bank_service] Aile zinciri çekilemedi (family_id=%s).", family_id, exc_info=True)
        return []

    rows = result.data or []
    start_rank = _DIFFICULTY_RANK.get(start_difficulty, 0)
    chain = [row for row in rows if _DIFFICULTY_RANK.get(row.get("difficulty"), 0) >= start_rank]
    chain.sort(key=lambda row: _DIFFICULTY_RANK.get(row.get("difficulty"), 0))
    for row in chain:
        row["similarity"] = None
    return chain


def _rank_with_exposure_penalty(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Adayları `similarity - QUESTION_BANK_EXPOSURE_PENALTY * log1p(times_served)`
    skoruna göre azalan sırada sıralar — sık seçilmiş (yüksek times_served)
    sorular hafifçe geri plana atılır ki aynı popüler soru her mülakatta
    tekrar tekrar sorulmasın (bkz. CAT sistemlerindeki "item exposure
    control" prensibi). Skor farkı küçükse benzerlik hâlâ baskın kalır —
    bu sert bir filtre değil, ince bir çeşitlilik itmesidir.
    """
    def _adjusted_score(row: Dict[str, Any]) -> float:
        times_served = row.get("times_served") or 0
        return row["similarity"] - settings.QUESTION_BANK_EXPOSURE_PENALTY * math.log1p(times_served)

    return sorted(rows, key=_adjusted_score, reverse=True)


async def _increment_times_served(question_ids: List[str]) -> None:
    """Havuza seçilen soruların `times_served` sayacını TEK bir atomik RPC
    çağrısıyla artırır (bkz. sql/002_exposure_control_and_gaps.sql). Best-effort
    — başarısız olursa yalnızca loglanır, mülakatı etkilemez."""
    if not supabase or not question_ids:
        return
    try:
        supabase.rpc("increment_times_served", {"question_ids": question_ids}).execute()
    except Exception:
        logger.warning(
            "[question_bank_service] times_served güncellenemedi (ids=%s).", question_ids, exc_info=True,
        )


async def _log_question_bank_gap(role: str, topic: str, difficulty: Optional[str], missing_count: int) -> None:
    """
    Bankanın bu role+topic+difficulty kombinasyonu için yeterli/hiç eşleşme
    döndüremediğini `question_bank_gaps` tablosuna kaydeder (aynı kombinasyon
    tekrar görülürse `miss_count` artırılır). Best-effort — hata durumunda
    yalnızca loglanır, mülakatı ASLA etkilemez.
    """
    if not supabase:
        return
    try:
        query = supabase.table("question_bank_gaps").select("id, miss_count").eq("role", role).eq("topic", topic)
        query = query.is_("difficulty", "null") if difficulty is None else query.eq("difficulty", difficulty)
        existing = query.execute()

        if existing.data:
            row = existing.data[0]
            supabase.table("question_bank_gaps").update({
                "miss_count": (row.get("miss_count") or 0) + 1,
                "last_missing_count": missing_count,
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"]).execute()
        else:
            supabase.table("question_bank_gaps").insert({
                "role": role,
                "topic": topic,
                "difficulty": difficulty,
                "miss_count": 1,
                "last_missing_count": missing_count,
            }).execute()
    except Exception:
        logger.warning(
            "[question_bank_service] Boşluk kaydedilemedi (role=%s, topic=%s, difficulty=%s).",
            role, topic, difficulty, exc_info=True,
        )
