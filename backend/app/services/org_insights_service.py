"""
Faz 4A — kurum paneli için içgörüler.

Gizlilik kuralları (KVKK ve öğrenci güveni için):
- Kuruma katılmak, eğitmenin öğrencinin skorlarını tek tek görmesine izin
  vermek DEĞİLDİR. Öğrenci bazında skor/ilerleme yalnızca o öğrenci
  `share_progress` rızası verdiyse döner; aksi halde alanlar boş gelir.
- Kurum geneli toplu istatistikler (ortalamalar, haftalık eğilim, konular) en
  az MIN_COHORT farklı öğrencinin katkısı varsa gösterilir. Daha küçük
  gruplarda ortalama, paylaşım yapmamış tek bir öğrencinin skorunu dolaylı
  olarak açığa çıkarabilir.
- Yalnızca kurum bağlamında (interviews.org_id) yapılan mülakatlar sayılır;
  öğrencinin bireysel mülakatları kuruma hiçbir zaman görünmez.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import logging

from app.core.database import aw, run, supabase
from app.services import progress_service

logger = logging.getLogger(__name__)

MIN_COHORT = 3
WEEKS = 8


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def _identity(row: Dict[str, Any]) -> Dict[str, Optional[str]]:
    name = " ".join(p for p in (row.get("first_name"), row.get("last_name")) if p) or None
    return {"email": row.get("email"), "name": name}


async def get_identities(user_ids: List[str]) -> Dict[str, Dict[str, Optional[str]]]:
    """
    Üyelerin e-posta ve adını `profiles` tablosundan TEK sorguyla okur (yalnızca kurum
    yöneticisi/eğitmen görür). Önceden üye başına ayrı bir Auth admin isteği yapılıyordu.
    profiles, auth.users'tan tetikleyiciyle senkron tutulur (bkz. sql/020_profiles.sql).
    Bulunamayan ya da okunamayan üye için alanlar boş döner.
    """
    ids = [str(u) for u in dict.fromkeys(user_ids)]
    out: Dict[str, Dict[str, Optional[str]]] = {u: {"email": None, "name": None} for u in ids}
    for start in range(0, len(ids), 200):
        try:
            rows = (await run(
                supabase.table("profiles").select("id, email, first_name, last_name").in_("id", ids[start:start + 200])
            )).data or []
        except Exception:
            logger.warning("Üye kimlikleri okunamadı.", exc_info=True)
            continue
        for row in rows:
            out[str(row["id"])] = _identity(row)
    return out


async def get_identity(user_id: str) -> Dict[str, Optional[str]]:
    return (await get_identities([user_id]))[str(user_id)]


def scope_to_group(memberships: List[Dict[str, Any]], data: Dict[str, Any],
                   group_id: Optional[str]) -> tuple:
    """
    Paneli bir gruba (kohort) daraltır: yalnızca o grubun üyeleri ve onların
    kurum mülakatları. MIN_COHORT kuralı daraltılmış veriye ayrıca uygulanır,
    yani küçük bir grupta toplu ortalama yine gizlenir.
    """
    if not group_id:
        return memberships, data
    scoped = [m for m in memberships if str(m.get("group_id") or "") == str(group_id)]
    users = {str(m["user_id"]) for m in scoped}
    interviews = [i for i in data["interviews"] if str(i.get("user_id")) in users]
    return scoped, {"interviews": interviews, "analytics": data["analytics"]}


def build_overview(org: Dict[str, Any], memberships: List[Dict[str, Any]], data: Dict[str, Any],
                   now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    # Yalnızca öğrencilerin mülakatları: eğitmen/yönetici kendi skorunu bildiği için onun
    # mülakatları MIN_COHORT eşiğini doldurursa ortalamadan öğrenci skoru çıkarılabilir.
    candidates = {str(m["user_id"]) for m in memberships if m["role"] == "candidate"}
    interviews = [i for i in data["interviews"] if str(i.get("user_id")) in candidates]
    timeline = progress_service.build_timeline(interviews, data["analytics"], org.get("rubric"))
    owner = {i["id"]: str(i.get("user_id")) for i in interviews}

    role_counts: Dict[str, int] = defaultdict(int)
    for m in memberships:
        role_counts[m["role"]] += 1

    contributors = {owner[p["id"]] for p in timeline}
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    recent_cutoff = now - timedelta(days=30)
    active_30d = {owner[p["id"]] for p in timeline if (_parse(p["date"]) or now) >= recent_cutoff}
    month_count = sum(1 for p in timeline if (_parse(p["date"]) or now) >= month_start)

    overview: Dict[str, Any] = {
        "org": {"id": org["id"], "name": org["name"], "monthly_interview_quota": org.get("monthly_interview_quota"),
                "rubric": org.get("rubric")},
        "member_counts": dict(role_counts),
        "completed_count": len(timeline),
        "contributors": len(contributors),
        "active_students_30d": len(active_30d),
        "month_interviews": month_count,
        "min_cohort": MIN_COHORT,
        "aggregates_available": len(contributors) >= MIN_COHORT,
        "metric_means": {},
        "weekly": [],
        "topics": [],
    }
    if not overview["aggregates_available"]:
        return overview

    overview["metric_means"] = {
        m: progress_service._mean([p[m] for p in timeline]) for m in progress_service.METRICS + ("average",)
    }

    weeks: Dict[str, Dict[str, Any]] = {}
    first_week = now - timedelta(weeks=WEEKS - 1)
    for p in timeline:
        dt = _parse(p["date"])
        if not dt or dt < first_week - timedelta(days=7):
            continue
        year, week, _ = dt.isocalendar()
        key = f"{year}-W{week:02d}"
        w = weeks.setdefault(key, {"week": key, "scores": [], "students": set()})
        w["scores"].append(p["average"])
        w["students"].add(owner[p["id"]])
    # Bir haftada MIN_COHORT'tan az öğrenci varsa o haftanın ortalaması gösterilmez (yalnızca sayısı).
    overview["weekly"] = [
        {"week": w["week"], "count": len(w["scores"]),
         "average": progress_service._mean(w["scores"]) if len(w["students"]) >= MIN_COHORT else None}
        for w in sorted(weeks.values(), key=lambda w: w["week"])
    ][-WEEKS:]
    overview["topics"] = progress_service._topics(timeline)[:10]
    return overview


def build_member_rows(memberships: List[Dict[str, Any]], data: Dict[str, Any],
                      identities: Dict[str, Dict[str, Optional[str]]],
                      weights: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    timeline = progress_service.build_timeline(data["interviews"], data["analytics"], weights)
    owner = {i["id"]: str(i.get("user_id")) for i in data["interviews"]}
    per_user: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for p in timeline:
        per_user[owner[p["id"]]].append(p)

    rows = []
    for m in memberships:
        uid = str(m["user_id"])
        points = per_user.get(uid, [])
        shared = bool(m.get("share_progress"))
        identity = identities.get(uid) or {}
        rows.append({
            "user_id": uid,
            "role": m["role"],
            "group_id": m.get("group_id"),
            "created_at": m.get("created_at"),
            "email": identity.get("email"),
            "name": identity.get("name"),
            "share_progress": shared,
            # Katılım (kaç mülakat, ne zaman) eğitmenin ödev takibi için görünür; skor yalnız rızayla.
            "interview_count": len(points),
            "last_interview_at": points[-1]["date"] if points else None,
            "average": progress_service._mean([p["average"] for p in points]) if shared else None,
        })
    role_order = {"org_admin": 0, "instructor": 1, "candidate": 2}
    return sorted(rows, key=lambda r: (role_order.get(r["role"], 3), (r["name"] or r["email"] or "").lower()))


def member_progress(memberships: List[Dict[str, Any]], user_id: str, data: Dict[str, Any],
                    weights: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    membership = next((m for m in memberships if str(m["user_id"]) == str(user_id)), None)
    if not membership:
        raise ValueError("Üye bulunamadı")
    if not membership.get("share_progress"):
        raise PermissionError("Bu öğrenci ilerlemesini kurumla paylaşmıyor.")
    own = [i for i in data["interviews"] if str(i.get("user_id")) == str(user_id)]
    return progress_service.build_progress(own, data["analytics"], weights)
