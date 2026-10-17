"""
Kurum kullanım ve maliyet raporu (sql/024).

Kaynak: llm_usage satırları (her model denemesi bir satır) + interviews.org_id.
Yalnızca kurum bağlamındaki mülakatların çağrıları kuruma atanır (bkz.
llm_service.bind_usage_context); CV/ilan gibi kişisel çağrılar ve öğrencinin
bireysel mülakatları kuruma yazılmaz. Başarısız denemeler de sağlayıcıya istek
olarak gittiği için sayılır, ayrıca gösterilir.

Maliyet bir TAHMİNDİR: model fiyatları settings.LLM_PRICES_JSON'dan gelir (USD /
1M token). Fiyatı tanımsız modelin maliyeti hesaplanmaz, raporda belirtilir.
"""
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.database import run, supabase

logger = logging.getLogger(__name__)

# Türkiye 2016'dan beri kalıcı UTC+3: ay sınırları kurumun yerel saatine göre.
TR_TZ = timezone(timedelta(hours=3))
PAGE = 1000

PURPOSE_LABELS = {
    "question": "Soru üretimi",
    "question_stream": "Soru üretimi",
    "question_from_bank": "Banka sorusunun sunulması",
    "question_from_bank_stream": "Banka sorusunun sunulması",
    "evaluation": "Mülakat değerlendirmesi",
}


def parse_month(month: Optional[str], now: Optional[datetime] = None) -> Tuple[datetime, datetime, str]:
    """'YYYY-MM' -> (başlangıç, bitiş) UTC; boşsa içinde bulunulan ay (TR saati)."""
    if month:
        try:
            year, mon = (int(x) for x in month.split("-"))
            start_local = datetime(year, mon, 1, tzinfo=TR_TZ)
        except (ValueError, TypeError):
            raise ValueError("Ay YYYY-AA biçiminde olmalı (örn. 2026-10).")
    else:
        local = (now or datetime.now(timezone.utc)).astimezone(TR_TZ)
        start_local = datetime(local.year, local.month, 1, tzinfo=TR_TZ)
    end_local = datetime(start_local.year + (start_local.month == 12), start_local.month % 12 + 1, 1, tzinfo=TR_TZ)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc), start_local.strftime("%Y-%m")


def prices() -> Dict[str, Dict[str, float]]:
    if not settings.LLM_PRICES_JSON:
        return {}
    try:
        raw = json.loads(settings.LLM_PRICES_JSON)
        return {m: {"input": float(p.get("input", 0)), "output": float(p.get("output", 0))} for m, p in raw.items()}
    except (ValueError, AttributeError, TypeError):
        logger.warning("[usage] LLM_PRICES_JSON okunamadı; maliyet hesaplanmayacak.")
        return {}


def _cost(model: str, prompt: int, completion: int, table: Dict[str, Dict[str, float]]) -> Optional[float]:
    price = table.get(model)
    if price is None:
        return None
    return (prompt * price["input"] + completion * price["output"]) / 1_000_000


def summarize(rows: List[Dict[str, Any]], interviews: List[Dict[str, Any]],
              price_table: Optional[Dict[str, Dict[str, float]]] = None) -> Dict[str, Any]:
    price_table = prices() if price_table is None else price_table
    by_model: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"calls": 0, "failed": 0, "prompt_tokens": 0, "completion_tokens": 0, "latency": []})
    by_purpose: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"calls": 0, "total_tokens": 0})
    daily: Dict[str, Dict[str, int]] = defaultdict(lambda: {"calls": 0, "total_tokens": 0})

    for r in rows:
        model = r.get("model") or "?"
        m = by_model[model]
        m["calls"] += 1
        m["failed"] += 0 if r.get("success") else 1
        m["prompt_tokens"] += r.get("prompt_tokens") or 0
        m["completion_tokens"] += r.get("completion_tokens") or 0
        if r.get("success") and r.get("latency_ms") is not None:
            m["latency"].append(r["latency_ms"])
        label = PURPOSE_LABELS.get(r.get("purpose") or "", r.get("purpose") or "Diğer")
        by_purpose[label]["calls"] += 1
        by_purpose[label]["total_tokens"] += r.get("total_tokens") or 0
        created = r.get("created_at")
        if created:
            day = datetime.fromisoformat(str(created).replace("Z", "+00:00")).astimezone(TR_TZ).strftime("%Y-%m-%d")
            daily[day]["calls"] += 1
            daily[day]["total_tokens"] += r.get("total_tokens") or 0

    models = []
    total_cost = 0.0
    unpriced = []
    for name, m in sorted(by_model.items(), key=lambda kv: -kv[1]["calls"]):
        cost = _cost(name, m["prompt_tokens"], m["completion_tokens"], price_table)
        if cost is None:
            unpriced.append(name)
        else:
            total_cost += cost
        models.append({
            "model": name,
            "calls": m["calls"],
            "failed": m["failed"],
            "prompt_tokens": m["prompt_tokens"],
            "completion_tokens": m["completion_tokens"],
            "avg_latency_ms": round(sum(m["latency"]) / len(m["latency"])) if m["latency"] else None,
            "estimated_cost_usd": round(cost, 4) if cost is not None else None,
        })

    calls = sum(m["calls"] for m in models)
    failed = sum(m["failed"] for m in models)
    prompt = sum(m["prompt_tokens"] for m in models)
    completion = sum(m["completion_tokens"] for m in models)
    interview_ids = {str(i["id"]) for i in interviews}
    # Mülakat başına token yalnızca kullanım kaydı olan mülakatlar üzerinden: kayıt (sql/024)
    # başlamadan önceki mülakatlar paydaya girerse ortalama yapay olarak düşer.
    metered = {str(r["interview_id"]) for r in rows if r.get("interview_id")}
    completed = sum(1 for i in interviews if i.get("status") == "completed")
    return {
        "interviews_started": len(interview_ids),
        "interviews_completed": completed,
        "students": len({str(i.get("user_id")) for i in interviews}),
        "calls": calls,
        "failed_calls": failed,
        "success_rate": round(100 * (calls - failed) / calls, 1) if calls else None,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
        "metered_interviews": len(metered),
        "tokens_per_interview": round((prompt + completion) / len(metered)) if metered else None,
        # Yalnızca fiyatı tanımlı modellerin toplamı; tanımsız olanlar unpriced_models'te (toplam eksik demektir).
        "estimated_cost_usd": round(total_cost, 4) if len(unpriced) < len(models) else None,
        "unpriced_models": unpriced,
        "by_model": models,
        "by_purpose": sorted(({"purpose": k, **v} for k, v in by_purpose.items()), key=lambda x: -x["calls"]),
        "daily": [{"date": d, **v} for d, v in sorted(daily.items())],
    }


async def _paged(query_factory) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    start = 0
    while True:
        chunk = (await run(query_factory().range(start, start + PAGE - 1))).data or []
        out.extend(chunk)
        if len(chunk) < PAGE:
            return out
        start += PAGE


async def org_usage(org: Dict[str, Any], month: Optional[str] = None) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    start, end, label = parse_month(month)
    lo, hi = start.isoformat(), end.isoformat()
    rows = await _paged(lambda: supabase.table("llm_usage")
                        .select("purpose, model, success, latency_ms, prompt_tokens, completion_tokens, total_tokens, created_at, interview_id")
                        .eq("org_id", org["id"]).gte("created_at", lo).lt("created_at", hi).order("created_at"))
    interviews = await _paged(lambda: supabase.table("interviews").select("id, user_id, status")
                              .eq("org_id", org["id"]).gte("created_at", lo).lt("created_at", hi).order("created_at"))
    return {
        "month": label,
        "quota": org.get("monthly_interview_quota"),
        **summarize(rows, interviews),
    }
