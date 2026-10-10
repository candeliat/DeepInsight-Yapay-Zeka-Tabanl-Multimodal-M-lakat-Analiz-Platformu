"""
Faz 3 — gelişim ve raporlama. Yeni veri toplamaz; mevcut tamamlanmış
mülakat skorlarından (interviews) ve video/ses analizinden (interview_analytics)
zaman serisi, eğilim, zayıf konu ve öneri üretir.

Tamamen deterministik (LLM yok): aynı veri her zaman aynı raporu üretir,
öneriler açık kurallara dayanır ve test edilebilir.

Özgüven için mevcut kural korunur (bkz. interview.py /me): video analizi
tamamlanmışsa OBJEKTİF confidence_pct, yoksa LLM'in metin tabanlı tahmini.
"""
from typing import Any, Dict, List, Optional

from app.core.database import supabase
from app.services.ats_service import fold

METRICS = ("technical", "confidence", "vocabulary")
METRIC_LABELS = {"technical": "Teknik bilgi", "confidence": "Özgüven", "vocabulary": "İletişim ve kelime"}
WEAK_TOPIC_THRESHOLD = 60
TREND_WINDOW = 5
_LEVELS = ["JUNIOR", "ORTA", "UZMAN"]

METRIC_TIPS = {
    "technical": "Cevaplarınızı bir kavram tanımı + somut bir örnek + bir kısıt/ödünleşim (trade-off) şeklinde kurun.",
    "confidence": "Cevaba önce net bir hüküm cümlesiyle başlayın, sonra gerekçelendirin; \"sanırım\" gibi belirsizlik ifadelerini azaltın.",
    "vocabulary": "Konunun temel terimlerini doğru adlarıyla kullanın ve cevabı 2-3 cümlelik bir özetle bitirin.",
}


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _mean(values: List[Optional[float]]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def fetch_user_data(user_id: str) -> Dict[str, Any]:
    """Kullanıcının tamamlanmış mülakatlarını ve tamamlanmış video analizlerini çeker."""
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    interviews = (
        supabase.table("interviews")
        .select("id, role, topic, difficulty, status, technical_score, confidence_score, vocabulary_score, created_at")
        .eq("user_id", user_id).eq("status", "completed").order("created_at").execute().data or []
    )
    analytics: Dict[str, Dict[str, Any]] = {}
    ids = [i["id"] for i in interviews]
    for start in range(0, len(ids), 100):
        rows = (
            supabase.table("interview_analytics")
            .select("interview_id, confidence_pct, eye_contact_pct, filler_word_count, speech_rate_wpm, pause_count")
            .in_("interview_id", ids[start:start + 100]).eq("analysis_status", "completed").execute().data or []
        )
        analytics.update({r["interview_id"]: r for r in rows})
    return {"interviews": interviews, "analytics": analytics}


def build_timeline(interviews: List[Dict[str, Any]], analytics: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    timeline = []
    for inv in sorted(interviews, key=lambda i: i.get("created_at") or ""):
        video = analytics.get(inv["id"]) or {}
        objective = _num(video.get("confidence_pct"))
        point = {
            "id": inv["id"],
            "date": inv.get("created_at"),
            "role": inv.get("role"),
            "topic": inv.get("topic"),
            "difficulty": inv.get("difficulty"),
            "technical": _num(inv.get("technical_score")),
            "confidence": objective if objective is not None else _num(inv.get("confidence_score")),
            "confidence_source": "video" if objective is not None else "text",
            "vocabulary": _num(inv.get("vocabulary_score")),
            "eye_contact_pct": _num(video.get("eye_contact_pct")),
            "filler_word_count": _num(video.get("filler_word_count")),
            "speech_rate_wpm": _num(video.get("speech_rate_wpm")),
            "pause_count": _num(video.get("pause_count")),
        }
        point["average"] = _mean([point[m] for m in METRICS])
        if point["average"] is not None:
            timeline.append(point)
    return timeline


def _trend(timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    recent = timeline[-TREND_WINDOW:]
    previous = timeline[-2 * TREND_WINDOW:-TREND_WINDOW]
    out: Dict[str, Any] = {}
    for key in METRICS + ("average",):
        now = _mean([p[key] for p in recent])
        before = _mean([p[key] for p in previous])
        out[key] = {"recent": now, "previous": before,
                    "delta": round(now - before, 1) if now is not None and before is not None else None}
    return out


def _topics(timeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups: Dict[str, Dict[str, Any]] = {}
    for p in timeline:
        topic = (p.get("topic") or "").strip()
        if not topic:
            continue
        key = " ".join(fold(topic).split())
        g = groups.setdefault(key, {"topic": topic, "role": p.get("role"), "scores": [], "difficulty": p.get("difficulty")})
        g["topic"], g["role"], g["difficulty"] = topic, p.get("role"), p.get("difficulty")  # en güncel yazım
        g["scores"].append(p["average"])
    result = [
        {"topic": g["topic"], "role": g["role"], "difficulty": g["difficulty"], "count": len(g["scores"]),
         "average": _mean(g["scores"]), "weak": (_mean(g["scores"]) or 0) < WEAK_TOPIC_THRESHOLD}
        for g in groups.values()
    ]
    return sorted(result, key=lambda t: (t["average"] if t["average"] is not None else 101, -t["count"]))


def _video_summary(timeline: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    with_video = [p for p in timeline if p["eye_contact_pct"] is not None or p["filler_word_count"] is not None]
    if not with_video:
        return None
    return {
        "count": len(with_video),
        "eye_contact_pct": _mean([p["eye_contact_pct"] for p in with_video]),
        "filler_word_count": _mean([p["filler_word_count"] for p in with_video]),
        "speech_rate_wpm": _mean([p["speech_rate_wpm"] for p in with_video]),
        "pause_count": _mean([p["pause_count"] for p in with_video]),
    }


def _recommendations(timeline, trend, metric_means, topics, video) -> List[Dict[str, Any]]:
    recs: List[Dict[str, Any]] = []

    for t in [t for t in topics if t["weak"]][:2]:
        recs.append({
            "id": f"topic:{t['topic']}",
            "title": f"\"{t['topic']}\" konusunda pratik yapın",
            "detail": f"Bu konudaki ortalamanız {t['average']:.0f}/100 ({t['count']} mülakat). Aynı konu ve seviyede tekrar edin.",
            "action": {"role": t["role"], "topic": t["topic"], "difficulty": t["difficulty"]},
        })

    weakest = min((m for m in METRICS if metric_means.get(m) is not None), key=lambda m: metric_means[m], default=None)
    if weakest and metric_means[weakest] < 75:
        recs.append({
            "id": f"metric:{weakest}",
            "title": f"En çok gelişim alanı: {METRIC_LABELS[weakest]}",
            "detail": f"Ortalamanız {metric_means[weakest]:.0f}/100. {METRIC_TIPS[weakest]}",
            "action": None,
        })

    delta = trend["average"]["delta"]
    if delta is not None and delta <= -5:
        recs.append({
            "id": "trend:down",
            "title": "Son mülakatlarda düşüş var",
            "detail": f"Son {TREND_WINDOW} mülakatın ortalaması öncekilere göre {abs(delta):.0f} puan düşük. Zorluğu bir kademe düşürüp temelleri pekiştirmeyi deneyin.",
            "action": None,
        })

    recent = timeline[-3:]
    if len(recent) == 3 and all((p["average"] or 0) >= 80 for p in recent):
        level = recent[-1].get("difficulty") or "ORTA"
        if level in _LEVELS and level != "UZMAN":
            nxt = _LEVELS[_LEVELS.index(level) + 1]
            recs.append({
                "id": "level:up",
                "title": f"{nxt} seviyesine geçmeye hazırsınız",
                "detail": f"Son 3 mülakatta 80'in üzerinde puan aldınız. Bir sonraki mülakatı {nxt} seviyesinde deneyin.",
                "action": {"role": recent[-1].get("role"), "topic": recent[-1].get("topic"), "difficulty": nxt},
            })

    if video:
        if video["eye_contact_pct"] is not None and video["eye_contact_pct"] < 50:
            recs.append({"id": "video:eye", "title": "Göz temasını artırın",
                         "detail": f"Ortalama göz temasınız %{video['eye_contact_pct']:.0f}. Cevap verirken kameraya bakmayı hedefleyin.",
                         "action": None})
        if video["filler_word_count"] is not None and video["filler_word_count"] > 8:
            recs.append({"id": "video:filler", "title": "Dolgu kelimeleri azaltın",
                         "detail": f"Mülakat başına ortalama {video['filler_word_count']:.0f} dolgu kelime (\"ııı\", \"şey\") kullanıyorsunuz. Cevaptan önce 1-2 saniye durup düşünmek bunu azaltır.",
                         "action": None})
        rate = video["speech_rate_wpm"]
        if rate is not None and (rate < 100 or rate > 170):
            recs.append({"id": "video:rate", "title": "Konuşma hızınızı dengeleyin",
                         "detail": f"Ortalama konuşma hızınız dakikada {rate:.0f} kelime; anlaşılır konuşma için 110-160 aralığı hedeflenir.",
                         "action": None})
    return recs[:6]


def build_progress(interviews: List[Dict[str, Any]], analytics: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    timeline = build_timeline(interviews, analytics)
    if not timeline:
        return {"completed_count": 0, "timeline": [], "trend": None, "metric_means": {}, "strongest": None,
                "weakest": None, "topics": [], "video": None, "recommendations": []}

    window = timeline[-10:]
    metric_means = {m: _mean([p[m] for p in window]) for m in METRICS}
    present = [m for m in METRICS if metric_means[m] is not None]
    trend = _trend(timeline)
    topics = _topics(timeline)
    video = _video_summary(timeline)
    return {
        "completed_count": len(timeline),
        "timeline": timeline,
        "trend": trend,
        "metric_means": metric_means,
        "strongest": max(present, key=lambda m: metric_means[m]) if present else None,
        "weakest": min(present, key=lambda m: metric_means[m]) if present else None,
        "topics": topics,
        "video": video,
        "recommendations": _recommendations(timeline, trend, metric_means, topics, video),
    }


def get_user_progress(user_id: str) -> Dict[str, Any]:
    data = fetch_user_data(user_id)
    return build_progress(data["interviews"], data["analytics"])
