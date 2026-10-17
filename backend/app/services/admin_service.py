"""
Platform admin paneli: genel sayılar, platform geneli yapay zekâ kullanımı/maliyeti ve
yapay zekâ envanteri (hangi özellik hangi modeli/aracı, nerede çalıştırıyor).

Kullanım verisi llm_usage'dan gelir (her model denemesi bir satır; sql/019 + sql/024).
Kurum kırılımı org_id'ye göredir; org_id'siz satırlar bireysel/kişisel kullanımdır
(bireysel mülakatlar, CV, ilan, ön yazı). Yalnızca platform admini erişir (require_admin);
öğrenci adı/e-postası dönmez, yalnızca sayılar.
"""
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from app.core.config import settings
from app.core.database import run, supabase
from app.services import local_embedding_service, org_usage_service
from app.services.org_usage_service import PURPOSES
from app.services.llm_service import llm_service

PERSONAL = "Bireysel / kişisel"

def _feature(purpose: str) -> str:
    return PURPOSES.get(purpose, {}).get("feature", purpose or "Diğer")


async def _count(table: str, **filters: Any) -> Optional[int]:
    query = supabase.table(table).select("id", count="exact")
    for key, (op, value) in filters.items():
        query = getattr(query, op)(key, value)
    try:
        return (await run(query.limit(1))).count
    except Exception:
        return None


async def overview(month: Optional[str] = None) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    start, end, label = org_usage_service.parse_month(month)
    lo, hi = start.isoformat(), end.isoformat()
    return {
        "month": label,
        "users": await _count("profiles"),
        "organizations": await _count("organizations"),
        "interviews_total": await _count("interviews"),
        "interviews_completed": await _count("interviews", status=("eq", "completed")),
        "interviews_month": await _month_count("interviews", lo, hi),
        "cvs": await _count("cvs"),
        "job_postings": await _count("job_postings"),
    }


async def _month_count(table: str, lo: str, hi: str) -> Optional[int]:
    try:
        return (await run(supabase.table(table).select("id", count="exact").gte("created_at", lo).lt("created_at", hi).limit(1))).count
    except Exception:
        return None


def summarize_platform(rows: List[Dict[str, Any]], interviews: List[Dict[str, Any]], org_names: Dict[str, str],
                       price_table: Optional[Dict[str, Dict[str, float]]] = None) -> Dict[str, Any]:
    """org_usage_service.summarize + özellik ve kurum kırılımı."""
    prices = org_usage_service.prices() if price_table is None else price_table
    base = org_usage_service.summarize(rows, interviews, prices)

    by_feature: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"calls": 0, "failed": 0, "total_tokens": 0, "latency": [], "purposes": set()})
    by_org: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"calls": 0, "total_tokens": 0, "cost": 0.0, "priced": False, "users": set()})
    for r in rows:
        f = by_feature[_feature(r.get("purpose") or "")]
        f["calls"] += 1
        f["failed"] += 0 if r.get("success") else 1
        f["total_tokens"] += r.get("total_tokens") or 0
        f["purposes"].add(r.get("purpose") or "")
        if r.get("success") and r.get("latency_ms") is not None:
            f["latency"].append(r["latency_ms"])

        org_key = str(r["org_id"]) if r.get("org_id") else ""
        o = by_org[org_key]
        o["calls"] += 1
        o["total_tokens"] += r.get("total_tokens") or 0
        if r.get("user_id"):
            o["users"].add(str(r["user_id"]))
        price = prices.get(r.get("model") or "")
        if price:
            o["priced"] = True
            o["cost"] += ((r.get("prompt_tokens") or 0) * price["input"] + (r.get("completion_tokens") or 0) * price["output"]) / 1_000_000

    base["by_feature"] = sorted((
        {"feature": name, "calls": f["calls"], "failed": f["failed"], "total_tokens": f["total_tokens"],
         "avg_latency_ms": round(sum(f["latency"]) / len(f["latency"])) if f["latency"] else None,
         "purposes": sorted(f["purposes"])}
        for name, f in by_feature.items()
    ), key=lambda x: -x["total_tokens"])
    base["by_org"] = sorted((
        {"org_id": key or None, "name": org_names.get(key, "Silinmiş kurum") if key else PERSONAL,
         "calls": o["calls"], "total_tokens": o["total_tokens"], "users": len(o["users"]),
         "estimated_cost_usd": round(o["cost"], 4) if o["priced"] else None}
        for key, o in by_org.items()
    ), key=lambda x: -x["total_tokens"])
    base["active_users"] = len({str(r["user_id"]) for r in rows if r.get("user_id")})
    return base


async def ai_usage(month: Optional[str] = None) -> Dict[str, Any]:
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    start, end, label = org_usage_service.parse_month(month)
    lo, hi = start.isoformat(), end.isoformat()
    rows = await org_usage_service._paged(lambda: supabase.table("llm_usage").select(
        "purpose, model, success, latency_ms, prompt_tokens, completion_tokens, total_tokens, created_at, interview_id, org_id, user_id",
    ).gte("created_at", lo).lt("created_at", hi).order("created_at"))
    interviews = await org_usage_service._paged(lambda: supabase.table("interviews").select("id, user_id, status")
                                                .gte("created_at", lo).lt("created_at", hi).order("created_at"))
    org_ids = sorted({str(r["org_id"]) for r in rows if r.get("org_id")})
    org_names = {}
    if org_ids:
        org_names = {str(o["id"]): o["name"] for o in ((await run(supabase.table("organizations").select("id, name").in_("id", org_ids))).data or [])}
    return {"month": label, **summarize_platform(rows, interviews, org_names)}


def ai_inventory() -> Dict[str, Any]:
    """Kullanılan yapay zekâ bileşenleri, çalıştıkları yer ve canlı durum (bu süreç için)."""
    host = urlparse(settings.LLM_BASE_URL).netloc or settings.LLM_BASE_URL
    now = time.monotonic()
    breaker = llm_service._breaker
    stats = llm_service.get_usage_stats()
    chain = []
    for order, model in enumerate(llm_service._fallback_models(), start=1):
        reopen = breaker.reopens_at(model)
        chain.append({
            "order": order,
            "model": model,
            "json_mode": model not in llm_service.JSON_MODE_UNSUPPORTED,
            "circuit_open": not breaker.allows(model),
            "reopens_in_s": round(reopen - now) if reopen > now else None,
            "since_start": stats.get(model) or None,
        })
    purposes = [{"purpose": p, **meta} for p, meta in PURPOSES.items()]
    return {
        "llm": {
            "provider": host,
            "chain": chain,
            "paid_fallback_enabled": settings.ENABLE_PAID_MODEL_FALLBACK,
            "attempt_timeout_s": settings.LLM_ATTEMPT_MAX_DURATION,
            "json_attempt_timeout_s": settings.LLM_JSON_ATTEMPT_MAX_DURATION,
            "purposes": purposes,
            "prices_configured": bool(org_usage_service.prices()),
        },
        "components": [
            {"id": "embedding_api", "name": "Soru bankası embedding (API)", "model": settings.QUESTION_BANK_EMBEDDING_MODEL,
             "runs": f"Bulut ({host})", "kind": "Yapay zekâ",
             "used_for": ["Soru bankasında anlamsal arama (etiket eşleşmesi yetmezse)", "Admin soru eklerken vektör üretimi"]},
            {"id": "embedding_local", "name": "Yerel embedding", "model": local_embedding_service._MODEL_NAME,
             "runs": "Sunucuda yerel", "kind": "Yapay zekâ",
             "used_for": ["API embedding'in yerel karşılığı (yüklüyse önce bu denenir)"],
             "loaded": local_embedding_service._model is not None},
            {"id": "whisper", "name": "Konuşmayı metne çevirme", "model": f"Whisper {settings.WHISPER_MODEL}",
             "runs": "Sunucuda yerel", "kind": "Yapay zekâ",
             "used_for": ["Mobilde sesli cevap", "Görüntülü mülakat kaydının analizi", "İngilizce mod (dil seçimiyle)"]},
            {"id": "ocr", "name": "OCR", "model": "EasyOCR (Türkçe + İngilizce)", "runs": "Sunucuda yerel", "kind": "Yapay zekâ",
             "used_for": ["Taranmış ya da görsel CV'nin metne çevrilmesi"]},
            {"id": "face", "name": "Yüz izleme", "model": "MediaPipe Face Landmarker", "runs": "Sunucuda yerel", "kind": "Yapay zekâ",
             "used_for": ["Video analizi: göz teması, baş hareketi"]},
            {"id": "audio", "name": "Ses sinyali analizi", "model": "librosa", "runs": "Sunucuda yerel", "kind": "Sinyal işleme",
             "used_for": ["Video analizi: konuşma hızı, duraklamalar"]},
            {"id": "rules", "name": "Kural tabanlı (yapay zekâ yok)", "model": "—", "runs": "Sunucuda", "kind": "Kural tabanlı",
             "used_for": ["ATS skoru", "İlan uyum skoru", "STAR koçluğu", "Dolgu kelimeleri", "Ön yazı dürüstlük kontrolü",
                          "Pratik seti seçimi", "Gelişim önerileri"]},
        ],
        "note": "Zincirdeki 'bu süreçte' sayıları backend açıldığından beri tutulur; kalıcı kullanım için Kullanım sekmesine bakın.",
    }
