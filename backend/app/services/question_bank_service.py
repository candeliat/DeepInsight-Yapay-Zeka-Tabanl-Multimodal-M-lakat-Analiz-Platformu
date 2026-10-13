import asyncio
import logging
import math
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.database import run, supabase
from app.services.llm_service import llm_service
from app.services.local_embedding_service import embed_text_local_if_ready
from app.services.question_tags import interview_tags, related_tags

logger = logging.getLogger(__name__)

# Aile zincirlerini zorluk sırasına göre dizmek için (bkz. _fetch_family_chain).
# Tanınmayan/boş zorluk en kolay kabul edilir.
_DIFFICULTY_RANK = {"JUNIOR": 0, "ORTA": 1, "UZMAN": 2}

# Etiket tabanlı sıralama ağırlıkları (bkz. _rank_by_tags).
_TOPIC_TAG_WEIGHT = 3.0
_WEAK_TAG_WEIGHT = 1.0
_DIFFICULTY_BONUS = {0: 2.0, 1: 0.5, 2: -1.0}  # zorluk farkı -> puan
_TAG_EXPOSURE_PENALTY = 0.3
# Mülakatla ilgisiz her etiket için ceza: "tam bu konunun" sorusu, başka konunun içinde bu
# konuya değen sorudan önce gelir (ör. Python mülakatında ML sorusu değil Python sorusu).
_FOREIGN_TAG_PENALTY = 0.5
_TIE_JITTER = 0.2  # eşit puanlı sorular arasında çeşitlilik (her mülakatta aynı sorular gelmesin)
_rng = random.Random()

_POOL_COLUMNS = "id, question_text, difficulty, family_id, times_served, tags, question_type, answer_points, org_id"


async def fetch_question_pool(
    role: str,
    topic: str,
    difficulty: Optional[str],
    size: int,
    org_id: Optional[str] = None,
    skills_hint: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Mülakat başında (yalnızca `/start`'ta) BİR KEZ çağrılır: role+topic
    (+ difficulty) için soru bankasından en iyi `size` adet eşleşen soruyu
    getirir. Dönen liste `interviews.question_pool` (jsonb) kolonuna yazılır
    ve sonraki her tur (`/chat/stream`) mevcut `questions_asked`
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

    # 1) Etiket örtüşmesi: konu metninden bilinen beceri etiketi çıktıysa soru seçimi buna
    #    dayanır (embedding tek başına konu ayrımı yapamıyor, bkz. question_tags modül notu).
    topic_tags, weak_tags = interview_tags(role, topic, skills_hint)
    selected_rows: List[Dict[str, Any]] = []
    if topic_tags:
        tagged = await _fetch_tagged_rows(topic_tags | weak_tags, org_id)
        ranked = _rank_by_tags(tagged, topic_tags, weak_tags, difficulty)
        selected_rows = await _pack_pool_with_family_chains(ranked, size, org_id)

    # 2) Yedek: etiketle dolmadıysa (konu tanınmadı ya da banka o konuda yetersiz)
    #    semantik arama kalan yerleri doldurur. Etiketle dolduysa embedding çağrısı yapılmaz.
    if len(selected_rows) < size:
        semantic = await _semantic_candidates(role, topic, difficulty, size, org_id, skills_hint)
        used = {row["id"] for row in selected_rows}
        remaining = [row for row in semantic if row["id"] not in used]
        extra = await _pack_pool_with_family_chains(remaining, size - len(selected_rows), org_id)
        selected_rows += [row for row in extra if row["id"] not in used]

    pool = [
        {
            "id": row["id"],
            "question_text": row["question_text"],
            "similarity": row.get("similarity"),
            # Adaya gösterilmez; mülakat sonu değerlendirmesinde referans olarak kullanılır.
            "answer_points": row.get("answer_points") or [],
        }
        for row in selected_rows[:size]
    ]

    logger.info(
        "[question_bank_service] role=%s topic=%s difficulty=%s etiketler=%s/%s -> %d soru seçildi.",
        role, topic, difficulty, sorted(topic_tags), sorted(weak_tags), len(pool),
    )

    if len(pool) < size:
        await _log_question_bank_gap(role, topic, difficulty, missing_count=size - len(pool))

    if pool:
        await _increment_times_served([entry["id"] for entry in pool])

    return pool


async def _fetch_tagged_rows(tags: set, org_id: Optional[str]) -> List[Dict[str, Any]]:
    """Etiketlerden en az biriyle örtüşen aktif sorular (global + istenirse kurumun kendi soruları).
    Best-effort: hata/beklenmeyen yanıt durumunda boş liste."""
    try:
        query = (
            supabase.table("question_bank").select(_POOL_COLUMNS)
            .eq("is_active", True).overlaps("tags", sorted(tags))
        )
        query = query.or_(f"org_id.is.null,org_id.eq.{org_id}") if org_id else query.is_("org_id", "null")
        data = (await run(query)).data
    except Exception:
        logger.warning("[question_bank_service] Etiket sorgusu başarısız (tags=%s).", sorted(tags), exc_info=True)
        return []
    return data if isinstance(data, list) else []


def _rank_by_tags(
    rows: List[Dict[str, Any]], topic_tags: set, weak_tags: set, difficulty: Optional[str],
) -> List[Dict[str, Any]]:
    """
    Puan = 3 x konu etiketi örtüşmesi + 1 x rol/beceri etiketi örtüşmesi + zorluk uyumu
    (tam +2, komşu +0.5, uzak -1) - 0.5 x mülakatla ilgisiz etiket - sık sorulma cezası
    + küçük rastgele kırılım.
    Konu etiketiyle örtüşmeyen sorular yalnızca rol etiketi varsa ve sona doğru yer alır.
    Davranışsal sorular yalnızca konu davranışsal mülakatsa seçilir.
    """
    want_behavioral = "davranissal" in topic_tags
    relevant = topic_tags | weak_tags | related_tags(topic_tags)
    target = _DIFFICULTY_RANK.get(difficulty) if difficulty else None
    scored = []
    for row in rows:
        if (row.get("question_type") == "davranissal") != want_behavioral:
            continue
        tags = set(row.get("tags") or [])
        topic_hits, weak_hits = len(tags & topic_tags), len(tags & weak_tags)
        if not topic_hits and not weak_hits:
            continue
        score = _TOPIC_TAG_WEIGHT * topic_hits + _WEAK_TAG_WEIGHT * weak_hits
        score -= _FOREIGN_TAG_PENALTY * len(tags - relevant)
        if target is not None:
            score += _DIFFICULTY_BONUS[abs(_DIFFICULTY_RANK.get(row.get("difficulty"), 1) - target)]
        score -= _TAG_EXPOSURE_PENALTY * math.log1p(row.get("times_served") or 0)
        score += _rng.random() * _TIE_JITTER
        scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [row for _, row in scored]


async def _semantic_candidates(
    role: str, topic: str, difficulty: Optional[str], size: int,
    org_id: Optional[str], skills_hint: Optional[List[str]],
) -> List[Dict[str, Any]]:
    """Embedding benzerliğiyle aday sorular (eşik + sık sorulma cezası uygulanmış).
    Best-effort: embedding ya da RPC başarısız olursa boş liste."""
    # role+topic (+ difficulty) tek bir sorgu embedding'ine gömülür — role/topic
    # serbest metin olduğu için SQL tarafında tam eşleşme değil, semantik
    # benzerlik aranır (bkz. sql/001_question_bank.sql'deki match_questions).
    query_text = f"{role} pozisyonu için {topic} konusunda teknik mülakat sorusu"
    if skills_hint:
        # Adayın CV'sindeki öne çıkan beceriler aramayı o yöne çeker.
        query_text += f". Adayın becerileri: {', '.join(skills_hint[:8])}"

    rpc_name = "match_questions"
    try:
        query_embedding = await llm_service.embed_text(query_text, input_type="query")
    except Exception:
        logger.warning(
            "[question_bank_service] API embedding alınamadı (role=%s, topic=%s) — yerel modele düşülüyor.",
            role, topic, exc_info=True,
        )
        try:
            query_embedding = await asyncio.to_thread(embed_text_local_if_ready, query_text)
            rpc_name = "match_questions_local"
            if query_embedding is None:
                # Model soğuk: mülakat başlangıcı ~75 sn yükleme beklemesin; bu sefer LLM üretir.
                logger.warning("[question_bank_service] Yerel embedding modeli henüz yüklenmedi — semantik arama atlanıyor.")
                return []
        except Exception:
            logger.warning(
                "[question_bank_service] Yerel embedding fallback de başarısız (role=%s, topic=%s) — semantik arama atlanıyor.",
                role, topic, exc_info=True,
            )
            return []

    # Exposure-control ile yeniden sıralayabilmek için `size`'dan daha fazla aday çekilir.
    rpc_params: Dict[str, Any] = {
        "query_embedding": query_embedding,
        "filter_difficulty": difficulty,
        "match_count": min(size * settings.QUESTION_BANK_CANDIDATE_POOL_MULTIPLIER, 30),
    }
    if org_id:
        # Yalnızca kurum bağlamında gönderilir: verilmezse yalnızca global sorular aranır.
        rpc_params["filter_org_id"] = org_id

    try:
        result = (await run(supabase.rpc(rpc_name, rpc_params)))
    except Exception:
        logger.warning(
            "[question_bank_service] %s RPC başarısız (role=%s, topic=%s) — semantik arama atlanıyor.",
            rpc_name, role, topic, exc_info=True,
        )
        return []

    rows = result.data or []
    relevant_rows = [
        row for row in rows
        if row.get("similarity") is not None and row["similarity"] >= settings.QUESTION_BANK_MIN_SIMILARITY
    ]
    return _rank_with_exposure_penalty(relevant_rows)


async def _pack_pool_with_family_chains(
    ranked_rows: List[Dict[str, Any]], size: int, org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Sıralanmış adaylardan `size` uzunluğunda nihai havuzu oluşturur. Bir aday
    bir aileye (`family_id`) aitse ve o aile bu havuzda daha önce hiç
    kullanılmadıysa, tek satır yerine o ailenin EŞLEŞEN zorluktan başlayıp
    daha zoruna doğru giden TÜM varyantları ardışık slotlara paketlenir —
    gerçek mülakatların "tek bir konuyu derinleştirme" desenini statik olarak
    taklit eder (bkz. modül başındaki genel not). Aile üyesi olmayan adaylar
    olduğu gibi eklenir.

    Not: Bu fonksiyon `/start` sırasında TEK SEFERE çalışır — sonraki turlar
    (`/chat/stream`) yalnızca burada üretilen sabit listeyi index'e göre tüketir,
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
            chain = await _fetch_family_chain(family_id, start_difficulty=row.get("difficulty"), org_id=org_id)
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


async def _fetch_family_chain(
    family_id: str, start_difficulty: Optional[str], org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
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
            (await run(supabase.table("question_bank")
            .select("id, question_text, difficulty, org_id, answer_points")
            .eq("family_id", family_id)
            .eq("is_active", True)))
        )
    except Exception:
        logger.warning("[question_bank_service] Aile zinciri çekilemedi (family_id=%s).", family_id, exc_info=True)
        return []

    # Kapsam sızıntısını önlemek için: yalnızca global ya da isteyen kurumun soruları.
    rows = [r for r in (result.data or []) if r.get("org_id") in (None, org_id)]
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
        (await run(supabase.rpc("increment_times_served", {"question_ids": question_ids})))
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
        existing = (await run(query))

        if existing.data:
            row = existing.data[0]
            (await run(supabase.table("question_bank_gaps").update({
                "miss_count": (row.get("miss_count") or 0) + 1,
                "last_missing_count": missing_count,
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"])))
        else:
            (await run(supabase.table("question_bank_gaps").insert({
                "role": role,
                "topic": topic,
                "difficulty": difficulty,
                "miss_count": 1,
                "last_missing_count": missing_count,
            })))
    except Exception:
        logger.warning(
            "[question_bank_service] Boşluk kaydedilemedi (role=%s, topic=%s, difficulty=%s).",
            role, topic, difficulty, exc_info=True,
        )
