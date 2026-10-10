"""
Faz 4B — ödev atama.

Eğitmen kurum öğrencilerine rol/konu/zorluk ve (opsiyonel) son tarihli bir
mülakat ödevi verir. Ödevden başlatılan mülakat interviews.assignment_id ile
bağlanır; durum (başlamadı / devam ediyor / tamamladı) buradan hesaplanır.

Gizlilik: tamamlanma durumu bir katılım bilgisidir ve eğitmen görür; ödev
mülakatının SKORU ise eğitmene yalnızca öğrenci paylaşım rızası verdiyse
gösterilir (bkz. org_insights_service). Öğrenci kendi skorunu her zaman görür.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import supabase
from app.services import organization_service, progress_service

STATUS_ORDER = {"completed": 2, "in_progress": 1, "not_started": 0}


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def _interview_score(interview: Dict[str, Any]) -> Optional[float]:
    points = progress_service.build_timeline([interview], {})
    return points[0]["average"] if points else None


def _status_by_user(interviews: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Kullanıcı başına en ileri durum; tamamlanmışsa en son tamamlanan mülakat."""
    result: Dict[str, Dict[str, Any]] = {}
    for inv in sorted(interviews, key=lambda i: i.get("created_at") or ""):
        uid = str(inv.get("user_id"))
        status = "completed" if inv.get("status") == "completed" else "in_progress"
        current = result.get(uid)
        if current is None or STATUS_ORDER[status] >= STATUS_ORDER[current["status"]]:
            result[uid] = {"status": status, "interview": inv}
    return result


def assignment_interviews(assignment_ids: List[str], user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if not assignment_ids:
        return []
    query = (
        _db().table("interviews")
        .select("id, user_id, assignment_id, status, technical_score, confidence_score, vocabulary_score, created_at")
        .in_("assignment_id", assignment_ids)
    )
    if user_id:
        query = query.eq("user_id", user_id)
    return query.execute().data or []


# --- eğitmen tarafı ---

async def create_assignment(actor_id: str, org_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    record = {**payload, "org_id": org_id, "created_by": actor_id}
    if record.get("due_at") is not None:
        record["due_at"] = record["due_at"].isoformat()
    result = _db().table("assignments").insert(record).execute()
    if not result.data:
        raise RuntimeError("Ödev oluşturulamadı")
    created = result.data[0]
    await organization_service.log_audit(actor_id, org_id, "assignment.create", "assignment", created["id"])
    return created


async def list_org_assignments(org_id: str, memberships: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    assignments = (
        _db().table("assignments").select("*").eq("org_id", org_id).order("created_at", desc=True).execute().data or []
    )
    candidates = {str(m["user_id"]) for m in memberships if m["role"] == "candidate"}
    interviews = assignment_interviews([a["id"] for a in assignments])
    out = []
    for a in assignments:
        statuses = _status_by_user([i for i in interviews if i["assignment_id"] == a["id"] and str(i["user_id"]) in candidates])
        out.append({
            **a,
            "total_candidates": len(candidates),
            "completed_count": sum(1 for s in statuses.values() if s["status"] == "completed"),
            "in_progress_count": sum(1 for s in statuses.values() if s["status"] == "in_progress"),
        })
    return out


async def get_org_assignment(org_id: str, assignment_id: str) -> Optional[Dict[str, Any]]:
    result = _db().table("assignments").select("*").eq("id", assignment_id).eq("org_id", org_id).execute()
    return result.data[0] if result.data else None


def build_assignment_rows(memberships: List[Dict[str, Any]], interviews: List[Dict[str, Any]],
                          identities: Dict[str, Dict[str, Optional[str]]]) -> List[Dict[str, Any]]:
    statuses = _status_by_user(interviews)
    rows = []
    for m in memberships:
        if m["role"] != "candidate":
            continue
        uid = str(m["user_id"])
        state = statuses.get(uid)
        status = state["status"] if state else "not_started"
        shared = bool(m.get("share_progress"))
        rows.append({
            "user_id": uid,
            "email": (identities.get(uid) or {}).get("email"),
            "name": (identities.get(uid) or {}).get("name"),
            "status": status,
            "completed_at": state["interview"].get("created_at") if status == "completed" else None,
            "share_progress": shared,
            "score": _interview_score(state["interview"]) if (status == "completed" and shared) else None,
        })
    return sorted(rows, key=lambda r: (-STATUS_ORDER[r["status"]], (r["name"] or r["email"] or "").lower()))


async def delete_assignment(actor_id: str, org_id: str, assignment_id: str) -> bool:
    if not await get_org_assignment(org_id, assignment_id):
        return False
    _db().table("assignments").delete().eq("id", assignment_id).eq("org_id", org_id).execute()
    await organization_service.log_audit(actor_id, org_id, "assignment.delete", "assignment", assignment_id)
    return True


# --- öğrenci tarafı ---

async def my_assignments(user_id: str, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    memberships = _db().table("memberships").select("org_id").eq("user_id", user_id).eq("role", "candidate").execute().data or []
    org_ids = [m["org_id"] for m in memberships]
    if not org_ids:
        return []
    assignments = _db().table("assignments").select("*").in_("org_id", org_ids).execute().data or []
    orgs = {o["id"]: o["name"] for o in (_db().table("organizations").select("id, name").in_("id", org_ids).execute().data or [])}
    interviews = assignment_interviews([a["id"] for a in assignments], user_id=user_id)

    out = []
    for a in assignments:
        state = _status_by_user([i for i in interviews if i["assignment_id"] == a["id"]]).get(str(user_id))
        status = state["status"] if state else "not_started"
        due = _parse(a.get("due_at"))
        out.append({
            **a,
            "org_name": orgs.get(a["org_id"]),
            "status": status,
            "my_score": _interview_score(state["interview"]) if status == "completed" else None,
            "interview_id": state["interview"]["id"] if state else None,
            "overdue": bool(due and due < now and status != "completed"),
        })
    # Yapılacaklar önce (son tarihi yakın olan üstte), tamamlananlar sonda.
    return sorted(out, key=lambda a: (a["status"] == "completed", a.get("due_at") or "9999", a.get("created_at") or ""))


async def get_assignment_for_member(user_id: str, assignment_id: str) -> Optional[Dict[str, Any]]:
    """Ödev + kullanıcının o kurumun üyesi olduğu doğrulaması (mülakat başlatma için)."""
    result = _db().table("assignments").select("*").eq("id", assignment_id).execute()
    if not result.data:
        return None
    assignment = result.data[0]
    if not await organization_service.get_membership(assignment["org_id"], user_id):
        return None
    return assignment
