"""
Zayıf konular için otomatik pratik seti.

Gelişim analizindeki zayıf konulardan (yoksa ortalaması en düşük konulardan) soru
bankasının etiket tabanlı seçimiyle (question_bank_service._rank_by_tags, mülakattaki
seçimle aynı) somut sorular seçer. Kullanıcının önceki mülakatlarında karşılaştığı
sorular dışarıda bırakılır. Her soru "iyi cevapta olması gerekenler" maddeleriyle döner:
pratik setinde amaç çalışmaktır (mülakatta bu maddeler adaya gösterilmez).

Yalnızca global (kuruma ait olmayan) sorular kullanılır; embedding/LLM çağrısı yapılmaz.
"""
import asyncio
import math
from typing import Any, Dict, List, Optional, Set

from app.core.database import run, supabase
from app.services import progress_service
from app.services import question_bank_service as qb
from app.services.question_tags import interview_tags

DEFAULT_SIZE = 5
MAX_TOPICS = 2
_SEEN_INTERVIEWS = 50


def target_topics(topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Zayıf konular; yoksa ortalaması en düşük konular (en fazla MAX_TOPICS)."""
    weak = [t for t in topics if t.get("weak")]
    pool = weak or sorted((t for t in topics if t.get("average") is not None), key=lambda t: t["average"])
    return pool[:MAX_TOPICS]


async def _seen_question_ids(user_id: str) -> Set[str]:
    rows = (
        await run(supabase.table("interviews").select("question_pool").eq("user_id", user_id)
                  .order("created_at", desc=True).limit(_SEEN_INTERVIEWS))
    ).data or []
    return {str(q.get("id")) for r in rows for q in (r.get("question_pool") or []) if isinstance(q, dict) and q.get("id")}


def _item(row: Dict[str, Any], topic: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "question_text": row["question_text"],
        "difficulty": row.get("difficulty"),
        "question_type": row.get("question_type"),
        "answer_points": row.get("answer_points") or [],
        "topic": topic["topic"],
        "role": topic.get("role"),
    }


async def build_practice_set(user_id: str, size: int = DEFAULT_SIZE) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    progress = await asyncio.to_thread(progress_service.get_user_progress, user_id)
    targets = target_topics(progress.get("topics") or [])
    if not targets:
        return {"topics": [], "items": [], "unmatched_topics": [], "reason": "no_history"}

    seen = await _seen_question_ids(user_id)
    per_topic = math.ceil(size / len(targets))
    items: List[Dict[str, Any]] = []
    unmatched: List[str] = []
    used: Set[str] = set()
    for topic in targets:
        topic_tags, weak_tags = interview_tags(topic.get("role") or "", topic["topic"], None)
        if not topic_tags:
            unmatched.append(topic["topic"])
            continue
        rows = await qb._fetch_tagged_rows(topic_tags | weak_tags, None)
        ranked = qb._rank_by_tags(rows, topic_tags, weak_tags, topic.get("difficulty"))
        # Yalnızca konunun kendi soruları: _rank_by_tags rol etiketli soruları da sona ekliyor;
        # canlıda "Python" seti, Python soruları görülmüş olunca SQL/API sorularına kaymıştı.
        on_topic = [r for r in ranked if set(r.get("tags") or []) & topic_tags and str(r["id"]) not in used]
        # Zayıf konuda daha zor soru verilmez: önce seviyesinde/altında görülmemiş, sonra
        # seviyesinde görülmüş (tekrar çalışmak da pratiktir), en son daha zor sorular.
        # (Canlıda ORTA seviyedeki kullanıcıya görülmemiş diye UZMAN sorular geliyordu.)
        level = qb._DIFFICULTY_RANK.get(topic.get("difficulty"), 1)
        harder = lambda r: qb._DIFFICULTY_RANK.get(r.get("difficulty"), 1) > level  # noqa: E731
        on_topic.sort(key=lambda r: (harder(r), str(r["id"]) in seen))  # sıralama kararlı: etiket puanı korunur
        chosen = on_topic[:per_topic]
        if not chosen:
            unmatched.append(topic["topic"])
        for row in chosen:
            used.add(str(row["id"]))
            items.append(_item(row, topic))

    return {
        "topics": [{k: t.get(k) for k in ("topic", "role", "difficulty", "average", "count", "weak")} for t in targets],
        "items": items[:size],
        "unmatched_topics": unmatched,
        "reason": None if items else "no_questions",
    }


async def fetch_pool_by_ids(question_ids: List[str], org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """"Bu setle mülakat yap": verilen sırayla, aktif ve erişilebilir (global ya da kurumun) sorulardan
    mülakat havuzu. Erişilemeyen kimlikler sessizce düşer."""
    ids = list(dict.fromkeys(str(i) for i in question_ids))
    if not ids:
        return []
    query = supabase.table("question_bank").select("id, question_text, answer_points, org_id").in_("id", ids).eq("is_active", True)
    query = query.or_(f"org_id.is.null,org_id.eq.{org_id}") if org_id else query.is_("org_id", "null")
    rows = {str(r["id"]): r for r in ((await run(query)).data or [])}
    return [
        {"id": i, "question_text": rows[i]["question_text"], "similarity": None, "answer_points": rows[i].get("answer_points") or []}
        for i in ids if i in rows
    ]
