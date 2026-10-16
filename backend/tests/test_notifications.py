"""
Ödev hatırlatma — uygulama içi bildirimler. Gerçek Supabase çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_notifications.py -v
"""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

from app.services import assignment_service, notification_service, organization_service

from test_assignments import MEMBERS, NOW, _inv, as_user  # noqa: F401

ASSIGNMENT = {"id": "a1", "org_id": "org-a", "title": "React ödevi", "role": "Frontend", "topic": "React",
              "due_at": "2026-10-11T09:00:00+00:00"}


class _RecordingDB:
    """Her tabloya yapılan upsert/update çağrılarını kaydeder; update'in döndüreceği
    satırlar `update_returns` ile ayarlanır (koşullu güncelleme = bekleme süresi)."""

    def __init__(self, update_returns=None):
        self.upserts = []
        self.updates = []
        self.filters = []
        self.update_returns = update_returns if update_returns is not None else [{"id": "a1"}]

    def table(self, name):
        db = self

        class _Q:
            def __init__(self):
                self.op = None

            def upsert(self, rows, **kwargs):
                self.op = "upsert"
                db.upserts.append((name, rows, kwargs))
                self.rows = rows
                return self

            def update(self, values):
                self.op = "update"
                db.updates.append((name, values))
                return self

            def __getattr__(self, attr):
                def _f(*a, **k):
                    db.filters.append((name, attr, a))
                    return self
                return _f

            def execute(self):
                if self.op == "upsert":
                    return MagicMock(data=self.rows)
                if self.op == "update":
                    return MagicMock(data=db.update_returns)
                return MagicMock(data=[], count=0)

        return _Q()


# --- son tarih hatırlatmaları ---

def _mine(**overrides):
    return {**ASSIGNMENT, "status": "not_started", **overrides}


def test_due_soon_within_24_hours():
    [n] = notification_service.due_reminders("s1", [_mine(due_at="2026-10-11T09:00:00+00:00")], NOW)
    assert n["kind"] == "assignment_due_soon" and n["dedupe_key"] == "due_soon:a1"
    assert "11.10.2026 12:00" in n["body"]  # Türkiye saati (UTC+3)
    assert n["link"] == "/assignments" and n["org_id"] == "org-a"


def test_overdue_and_far_and_completed():
    items = [
        _mine(id="late", due_at="2026-10-09T09:00:00+00:00"),
        _mine(id="far", due_at="2026-10-20T09:00:00+00:00"),
        _mine(id="done", due_at="2026-10-11T09:00:00+00:00", status="completed"),
        _mine(id="nodue", due_at=None),
    ]
    reminders = notification_service.due_reminders("s1", items, NOW)
    assert [(n["assignment_id"], n["kind"]) for n in reminders] == [("late", "assignment_overdue")]


def test_sync_upserts_with_dedupe_and_ignores_duplicates(monkeypatch):
    db = _RecordingDB()
    monkeypatch.setattr(notification_service, "supabase", db)
    monkeypatch.setattr(assignment_service, "my_assignments", AsyncMock(return_value=[_mine()]))
    assert asyncio.run(notification_service.sync_due_reminders("s1", NOW)) == 1
    [(table, rows, kwargs)] = db.upserts
    assert table == "notifications" and kwargs == {"on_conflict": "user_id,dedupe_key", "ignore_duplicates": True}
    assert rows[0]["user_id"] == "s1"


def test_sync_without_reminders_writes_nothing(monkeypatch):
    db = _RecordingDB()
    monkeypatch.setattr(notification_service, "supabase", db)
    monkeypatch.setattr(assignment_service, "my_assignments", AsyncMock(return_value=[]))
    assert asyncio.run(notification_service.sync_due_reminders("s1", NOW)) == 0
    assert db.upserts == []


# --- yeni ödev ---

def test_new_assignment_notifies_only_target_candidates(monkeypatch):
    db = _RecordingDB()
    monkeypatch.setattr(notification_service, "supabase", db)
    members = MEMBERS + [{"user_id": "s4", "role": "candidate", "group_id": "g2"}]
    sent = asyncio.run(notification_service.notify_assignment_created({**ASSIGNMENT, "group_id": None}, members, "Ege Kariyer"))
    rows = db.upserts[0][1]
    assert sent == 4 and {r["user_id"] for r in rows} == {"s1", "s2", "s3", "s4"}  # eğitmen hariç
    assert rows[0]["title"] == "Yeni ödev: React ödevi" and rows[0]["body"].startswith("Ege Kariyer · Frontend / React")

    db2 = _RecordingDB()
    monkeypatch.setattr(notification_service, "supabase", db2)
    asyncio.run(notification_service.notify_assignment_created({**ASSIGNMENT, "group_id": "g2"}, members))
    assert [r["user_id"] for r in db2.upserts[0][1]] == ["s4"]  # gruba atanan ödev yalnızca grubun öğrencisine


# --- eğitmen hatırlatması ---

def test_remind_skips_completed_students(monkeypatch):
    db = _RecordingDB()
    monkeypatch.setattr(notification_service, "supabase", db)
    monkeypatch.setattr(assignment_service, "assignment_interviews", lambda ids: [_inv(1, "s1"), _inv(2, "s2", "ongoing")])
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    result = asyncio.run(notification_service.remind_assignment("teacher", "org-a", ASSIGNMENT, MEMBERS, "Ege", now=NOW))
    assert result["sent"] == 2
    assert {r["user_id"] for r in db.upserts[0][1]} == {"s2", "s3"}  # s1 tamamladı
    assert db.updates == [("assignments", {"last_reminded_at": NOW.isoformat()})]
    assert result["next_available_at"] == (NOW + timedelta(hours=12)).isoformat()


def test_remind_within_cooldown_raises(monkeypatch):
    db = _RecordingDB(update_returns=[])  # koşullu güncelleme satır döndürmedi = 12 saat dolmadı
    monkeypatch.setattr(notification_service, "supabase", db)
    last = (NOW - timedelta(hours=2)).isoformat()
    try:
        asyncio.run(notification_service.remind_assignment("teacher", "org-a", {**ASSIGNMENT, "last_reminded_at": last}, MEMBERS, now=NOW))
        raise AssertionError("ReminderTooSoon bekleniyordu")
    except notification_service.ReminderTooSoon as e:
        assert e.next_at == NOW + timedelta(hours=10)
    assert db.upserts == []


# --- HTTP ---

def test_candidate_cannot_remind(as_user):
    assert as_user("s1").post("/api/v1/organizations/org-a/assignments/a1/remind").status_code == 403


def test_instructor_remind_and_cooldown_http(as_user, monkeypatch):
    monkeypatch.setattr(assignment_service, "get_org_assignment", AsyncMock(return_value=ASSIGNMENT))
    remind = AsyncMock(return_value={"sent": 3, "last_reminded_at": NOW.isoformat(), "next_available_at": NOW.isoformat()})
    monkeypatch.setattr(notification_service, "remind_assignment", remind)
    resp = as_user("teacher").post("/api/v1/organizations/org-a/assignments/a1/remind")
    assert resp.status_code == 200 and resp.json()["sent"] == 3

    remind.side_effect = notification_service.ReminderTooSoon(datetime(2026, 10, 10, 20, 0, tzinfo=timezone.utc))
    resp = as_user("teacher").post("/api/v1/organizations/org-a/assignments/a1/remind")
    assert resp.status_code == 429 and "10.10.2026 23:00" in resp.json()["detail"]


def test_remind_other_org_assignment_404(as_user, monkeypatch):
    monkeypatch.setattr(assignment_service, "get_org_assignment", AsyncMock(return_value=None))
    assert as_user("teacher").post("/api/v1/organizations/org-a/assignments/x/remind").status_code == 404


def test_create_assignment_sends_new_notifications_best_effort(as_user, monkeypatch):
    created = {"id": "a1", "org_id": "org-a", "title": "React ödevi", "role": "Frontend", "topic": "React"}
    monkeypatch.setattr(assignment_service, "create_assignment", AsyncMock(return_value=created))
    notify = AsyncMock(side_effect=RuntimeError("db down"))
    monkeypatch.setattr(notification_service, "notify_assignment_created", notify)
    body = {"title": "React ödevi", "role": "Frontend", "topic": "React"}
    resp = as_user("teacher").post("/api/v1/organizations/org-a/assignments", json=body)
    assert resp.status_code == 200  # bildirim hatası ödev oluşturmayı bozmaz
    notify.assert_awaited_once()


def test_my_notifications_lists_even_if_sync_fails(as_user, monkeypatch):
    monkeypatch.setattr(notification_service, "sync_due_reminders", AsyncMock(side_effect=RuntimeError("x")))
    listing = {"items": [{"id": "n1", "kind": "assignment_new", "title": "Yeni ödev: X"}], "unread_count": 1}
    monkeypatch.setattr(notification_service, "list_for_user", AsyncMock(return_value=listing))
    resp = as_user("s1").get("/api/v1/notifications/me")
    assert resp.status_code == 200 and resp.json()["unread_count"] == 1


def test_mark_read_scoped_to_user(as_user, monkeypatch):
    mark = AsyncMock(return_value=2)
    monkeypatch.setattr(notification_service, "mark_read", mark)
    resp = as_user("s1").post("/api/v1/notifications/read", json={"ids": ["n1", "n2"]})
    assert resp.json() == {"updated": 2}
    assert mark.await_args.args == ("s1", ["n1", "n2"])


def test_mark_read_filters_by_user(monkeypatch):
    db = _RecordingDB(update_returns=[{"id": "n1"}])
    monkeypatch.setattr(notification_service, "supabase", db)
    assert asyncio.run(notification_service.mark_read("s1")) == 1
    assert ("notifications", "eq", ("user_id", "s1")) in db.filters
