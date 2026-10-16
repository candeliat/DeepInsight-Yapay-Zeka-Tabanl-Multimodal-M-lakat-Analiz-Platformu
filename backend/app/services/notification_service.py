"""
Ödev hatırlatma — uygulama içi bildirimler (sql/023).

- Yeni ödev: ödev oluşturulunca hedef öğrencilere.
- Son tarihe 24 saatten az kaldı / süresi geçti: zamanlayıcı yok; öğrenci
  bildirimlerini açtığında `sync_due_reminders` üretir. (user_id, dedupe_key)
  benzersiz olduğundan aynı bildirim bir kez oluşur.
- Eğitmen hatırlatması: tamamlamamış öğrencilere, ödev başına 12 saatte bir.
  Bekleme süresi `last_reminded_at` üzerinde koşullu güncellemeyle alınır; eş
  zamanlı iki tıklamadan yalnızca biri gönderir.

E-posta/anlık bildirim yok: bir e-posta sağlayıcısı eklendiğinde aynı kayıtlar
oradan da gönderilebilir.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.database import aw, run, supabase
from app.services import assignment_service, organization_service

DUE_SOON_WINDOW = timedelta(hours=24)
REMIND_COOLDOWN = timedelta(hours=12)
LINK = "/assignments"
# Türkiye 2016'dan beri kalıcı UTC+3; Windows'ta tzdata gerektirmemek için sabit ofset.
TR_TZ = timezone(timedelta(hours=3))


class ReminderTooSoon(Exception):
    def __init__(self, next_at: datetime):
        super().__init__("too soon")
        self.next_at = next_at


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def format_due(iso: Optional[str]) -> Optional[str]:
    due = assignment_service._parse(iso)
    return due.astimezone(TR_TZ).strftime("%d.%m.%Y %H:%M") if due else None


def _record(user_id: str, assignment: Dict[str, Any], kind: str, title: str, body: str, dedupe_key: str) -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "org_id": assignment.get("org_id"),
        "assignment_id": assignment.get("id"),
        "kind": kind,
        "title": title[:200],
        "body": body[:500],
        "link": LINK,
        "dedupe_key": dedupe_key,
    }


async def _insert(records: List[Dict[str, Any]]) -> int:
    """Daha önce üretilmiş (aynı dedupe_key) bildirimleri sessizce atlar."""
    if not records:
        return 0
    inserted = 0
    for start in range(0, len(records), 200):
        chunk = records[start:start + 200]
        result = await run(_db().table("notifications").upsert(chunk, on_conflict="user_id,dedupe_key", ignore_duplicates=True))
        inserted += len(result.data or [])
    return inserted


def _with_due(text: str, assignment: Dict[str, Any]) -> str:
    due = format_due(assignment.get("due_at"))
    return f"{text} · Son tarih: {due}" if due else text


# --- üretim ---

async def notify_assignment_created(assignment: Dict[str, Any], memberships: List[Dict[str, Any]],
                                    org_name: Optional[str] = None) -> int:
    body = _with_due(f"{org_name or 'Kurumunuz'} · {assignment['role']} / {assignment['topic']}", assignment)
    records = [
        _record(str(m["user_id"]), assignment, "assignment_new", f"Yeni ödev: {assignment['title']}", body,
                f"new:{assignment['id']}")
        for m in assignment_service.targets(assignment, memberships)
    ]
    return await _insert(records)


def due_reminders(user_id: str, assignments: List[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    """`my_assignments` çıktısından, tamamlanmamış ve son tarihi yakın/geçmiş ödevlerin bildirimleri."""
    out = []
    for a in assignments:
        due = assignment_service._parse(a.get("due_at"))
        if not due or a.get("status") == "completed":
            continue
        due_text = format_due(a.get("due_at"))
        if due < now:
            out.append(_record(user_id, a, "assignment_overdue", f"Ödevin süresi geçti: {a['title']}",
                               f"Son tarih {due_text} idi. Yine de tamamlayıp eğitmeninize gösterebilirsiniz.",
                               f"overdue:{a['id']}"))
        elif due - now <= DUE_SOON_WINDOW:
            out.append(_record(user_id, a, "assignment_due_soon", f"Son tarih yaklaşıyor: {a['title']}",
                               f"Son tarih: {due_text}. Ödevi henüz tamamlamadınız.", f"due_soon:{a['id']}"))
    return out


async def sync_due_reminders(user_id: str, now: Optional[datetime] = None) -> int:
    now = now or datetime.now(timezone.utc)
    return await _insert(due_reminders(user_id, await assignment_service.my_assignments(user_id, now), now))


async def remind_assignment(actor_id: str, org_id: str, assignment: Dict[str, Any], memberships: List[Dict[str, Any]],
                            org_name: Optional[str] = None, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Tamamlamamış hedef öğrencilere eğitmen hatırlatması. 12 saat dolmadıysa ReminderTooSoon."""
    now = now or datetime.now(timezone.utc)
    threshold = (now - REMIND_COOLDOWN).isoformat()
    claimed = await run(
        _db().table("assignments").update({"last_reminded_at": now.isoformat()})
        .eq("id", assignment["id"]).eq("org_id", org_id)
        .or_(f"last_reminded_at.is.null,last_reminded_at.lt.{threshold}")
    )
    if not claimed.data:
        last = assignment_service._parse(assignment.get("last_reminded_at")) or now
        raise ReminderTooSoon(last + REMIND_COOLDOWN)

    interviews = await aw(assignment_service.assignment_interviews([assignment["id"]]))
    done = {
        str(i["user_id"]) for i in interviews if i.get("status") == "completed"
    }
    pending = [m for m in assignment_service.targets(assignment, memberships) if str(m["user_id"]) not in done]
    body = _with_due(f"{org_name or 'Kurumunuz'} ödevi henüz tamamlanmadı", assignment)
    stamp = now.strftime("%Y%m%dT%H%M%S")
    sent = await _insert([
        _record(str(m["user_id"]), assignment, "assignment_reminder", f"Eğitmen hatırlatması: {assignment['title']}",
                body, f"remind:{assignment['id']}:{stamp}")
        for m in pending
    ])
    await organization_service.log_audit(actor_id, org_id, "assignment.remind", "assignment", assignment["id"], {"sent": sent})
    return {"sent": sent, "last_reminded_at": now.isoformat(), "next_available_at": (now + REMIND_COOLDOWN).isoformat()}


# --- okuma ---

async def list_for_user(user_id: str, limit: int = 30) -> Dict[str, Any]:
    items = (
        await run(_db().table("notifications").select("id, kind, title, body, link, assignment_id, read_at, created_at")
                  .eq("user_id", user_id).order("created_at", desc=True).limit(limit))
    ).data or []
    unread = (
        await run(_db().table("notifications").select("id", count="exact").eq("user_id", user_id).is_("read_at", "null").limit(1))
    )
    return {"items": items, "unread_count": unread.count if unread.count is not None else sum(1 for i in items if not i.get("read_at"))}


async def mark_read(user_id: str, ids: Optional[List[str]] = None) -> int:
    query = _db().table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", user_id).is_("read_at", "null")
    if ids:
        query = query.in_("id", ids)
    return len((await run(query)).data or [])
