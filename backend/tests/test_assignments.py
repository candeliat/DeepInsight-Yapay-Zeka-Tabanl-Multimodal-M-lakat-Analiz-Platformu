"""
Faz 4B — ödev atama testleri. Gerçek Supabase/LLM çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_assignments.py -v
"""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.api.routes.interview as interview_route
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import assignment_service, organization_service
from app.services import org_insights_service as insights
from app.services.llm_service import llm_service

from test_interview_chat_flow import client, _mock_interview_service  # noqa: F401

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
MEMBERS = [
    {"user_id": "teacher", "role": "instructor", "share_progress": False},
    {"user_id": "s1", "role": "candidate", "share_progress": True},
    {"user_id": "s2", "role": "candidate", "share_progress": False},
    {"user_id": "s3", "role": "candidate", "share_progress": False},
]


def _inv(i, user, status="completed", score=70, assignment="a1", day="2026-10-05"):
    return {"id": f"i{i}", "user_id": user, "assignment_id": assignment, "status": status,
            "technical_score": score, "confidence_score": score, "vocabulary_score": score,
            "created_at": f"{day}T10:00:00+00:00"}


class _Q:
    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return MagicMock(data=self.rows)


def _fake_db(tables):
    fake = MagicMock()
    fake.table.side_effect = lambda name: _Q(tables.get(name, []))
    return fake


# --- durum hesaplama ---

def test_completed_status_wins_over_later_ongoing_attempt():
    statuses = assignment_service._status_by_user([
        _inv(1, "s1", "completed", day="2026-10-01"), _inv(2, "s1", "ongoing", day="2026-10-03"),
        _inv(3, "s2", "ongoing"),
    ])
    assert statuses["s1"]["status"] == "completed" and statuses["s2"]["status"] == "in_progress"


def test_rows_show_score_only_with_consent_and_exclude_staff():
    rows = assignment_service.build_assignment_rows(
        MEMBERS, [_inv(1, "s1", score=80), _inv(2, "s2", score=40), _inv(3, "s3", "ongoing")], {"s1": {"name": "Ece"}},
    )
    by_user = {r["user_id"]: r for r in rows}
    assert "teacher" not in by_user
    assert by_user["s1"]["score"] == 80 and by_user["s1"]["status"] == "completed"
    assert by_user["s2"]["status"] == "completed" and by_user["s2"]["score"] is None  # rıza yok -> skor gizli
    assert by_user["s3"]["status"] == "in_progress"
    assert [r["status"] for r in rows] == ["completed", "completed", "in_progress"]


def test_rows_mark_not_started():
    rows = assignment_service.build_assignment_rows(MEMBERS, [], {})
    assert {r["status"] for r in rows} == {"not_started"} and len(rows) == 3


def test_org_list_counts_only_candidates(monkeypatch):
    monkeypatch.setattr(assignment_service, "supabase", _fake_db({
        "assignments": [{"id": "a1", "org_id": "org-a", "title": "React ödevi"}],
        "interviews": [_inv(1, "s1"), _inv(2, "s2", "ongoing"), _inv(3, "teacher")],
    }))
    [item] = asyncio.run(assignment_service.list_org_assignments("org-a", MEMBERS))
    assert item["total_candidates"] == 3 and item["completed_count"] == 1 and item["in_progress_count"] == 1


# --- öğrencinin ödevleri ---

def test_my_assignments_status_overdue_and_order(monkeypatch):
    monkeypatch.setattr(assignment_service, "supabase", _fake_db({
        "memberships": [{"org_id": "org-a"}],
        "organizations": [{"id": "org-a", "name": "Ege Kariyer"}],
        "assignments": [
            {"id": "a1", "org_id": "org-a", "title": "Bitti", "due_at": "2026-10-01T00:00:00+00:00", "created_at": "2026-09-20"},
            {"id": "a2", "org_id": "org-a", "title": "Gecikti", "due_at": "2026-10-05T00:00:00+00:00", "created_at": "2026-09-21"},
            {"id": "a3", "org_id": "org-a", "title": "Yakında", "due_at": "2026-10-20T00:00:00+00:00", "created_at": "2026-09-22"},
        ],
        "interviews": [_inv(1, "s2", score=45, assignment="a1")],
    }))
    items = asyncio.run(assignment_service.my_assignments("s2", now=NOW))
    by_id = {a["id"]: a for a in items}
    assert by_id["a1"]["status"] == "completed" and by_id["a1"]["my_score"] == 45  # öğrenci kendi skorunu görür
    assert by_id["a2"]["overdue"] is True and by_id["a3"]["overdue"] is False
    assert by_id["a1"]["overdue"] is False and by_id["a1"]["org_name"] == "Ege Kariyer"
    assert [a["id"] for a in items] == ["a2", "a3", "a1"]  # yapılacaklar önce, tamamlanan sonda


def test_my_assignments_empty_when_not_candidate(monkeypatch):
    monkeypatch.setattr(assignment_service, "supabase", _fake_db({"memberships": []}))
    assert asyncio.run(assignment_service.my_assignments("teacher")) == []


# --- ödevden mülakat başlatma ---

ASSIGNMENT = {"id": "a1", "org_id": "org-a", "role": "Backend Developer", "topic": "Python", "difficulty": "UZMAN"}


def _start_mocks(monkeypatch):
    fetch_pool = AsyncMock(return_value=[])
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", fetch_pool)
    create = AsyncMock(return_value={"id": "interview-1"})
    monkeypatch.setattr(interview_route, "create_interview", create)
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(llm_service, "get_next_question", AsyncMock(return_value="Merhaba!"))
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value={"role": "candidate"}))
    quota = AsyncMock(return_value=None)
    monkeypatch.setattr(organization_service, "check_interview_quota", quota)
    return fetch_pool, create, quota


def test_start_from_assignment_uses_assignment_values(client, monkeypatch):
    fetch_pool, create, quota = _start_mocks(monkeypatch)
    monkeypatch.setattr(assignment_service, "get_assignment_for_member", AsyncMock(return_value=ASSIGNMENT))

    resp = client.post("/api/v1/interview/start",
                       json={"role": "Başka rol", "topic": "Başka konu", "difficulty": "junior", "assignment_id": "a1"})

    assert resp.status_code == 200
    kwargs = create.await_args.kwargs
    assert (kwargs["role"], kwargs["topic"], kwargs["difficulty"]) == ("Backend Developer", "Python", "UZMAN")
    assert kwargs["org_id"] == "org-a" and kwargs["assignment_id"] == "a1"
    quota.assert_awaited_once_with("org-a")  # kurum kotası ödev için de uygulanır


def test_start_from_foreign_assignment_returns_404(client, monkeypatch):
    _, create, _ = _start_mocks(monkeypatch)
    monkeypatch.setattr(assignment_service, "get_assignment_for_member", AsyncMock(return_value=None))
    resp = client.post("/api/v1/interview/start", json={"role": "x" * 3, "topic": "y" * 3, "assignment_id": "a-of-other-org"})
    assert resp.status_code == 404
    create.assert_not_awaited()


# --- HTTP yetkileri ---

@pytest.fixture
def as_user(monkeypatch):
    roles = {("org-a", "teacher"): "instructor", ("org-a", "s1"): "candidate"}

    async def _get_membership(org_id, user_id):
        role = roles.get((org_id, user_id))
        return {"role": role} if role else None

    monkeypatch.setattr(organization_service, "get_membership", _get_membership)
    monkeypatch.setattr(organization_service, "list_members", AsyncMock(return_value=MEMBERS))
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value={"id": "org-a", "rubric": None}))
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    monkeypatch.setattr(insights, "get_identity", lambda uid: {"email": f"{uid}@x.com", "name": None})

    def _login(user_id):
        user = UserProfile(id=user_id, email=f"{user_id}@x.com", created_at="2026-01-01T00:00:00Z", user_metadata={}, app_metadata={})
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _login
    app.dependency_overrides.clear()


BODY = {"title": "React ödevi", "role": "Frontend", "topic": "React", "difficulty": "orta", "due_at": "2026-10-20T18:00:00+03:00"}


def test_candidate_cannot_create_assignment(as_user):
    assert as_user("s1").post("/api/v1/organizations/org-a/assignments", json=BODY).status_code == 403


def test_instructor_creates_assignment_with_normalized_level(as_user, monkeypatch):
    create = AsyncMock(return_value={"id": "a1", "org_id": "org-a", **{k: v for k, v in BODY.items() if k != "difficulty"},
                                     "difficulty": "ORTA", "due_at": "2026-10-20T15:00:00+00:00"})
    monkeypatch.setattr(assignment_service, "create_assignment", create)
    resp = as_user("teacher").post("/api/v1/organizations/org-a/assignments", json=BODY)
    assert resp.status_code == 200 and resp.json()["total_candidates"] == 3
    assert create.await_args.args[2]["difficulty"] == "ORTA"


def test_invalid_level_rejected(as_user):
    resp = as_user("teacher").post("/api/v1/organizations/org-a/assignments", json={**BODY, "difficulty": "KOLAY"})
    assert resp.status_code == 422


def test_students_endpoint_hides_unshared_scores(as_user, monkeypatch):
    monkeypatch.setattr(assignment_service, "get_org_assignment", AsyncMock(return_value={"id": "a1"}))
    monkeypatch.setattr(assignment_service, "assignment_interviews", lambda ids: [_inv(1, "s1", score=80), _inv(2, "s2", score=40)])
    rows = {r["user_id"]: r for r in as_user("teacher").get("/api/v1/organizations/org-a/assignments/a1/students").json()}
    assert rows["s1"]["score"] == 80 and rows["s2"]["score"] is None and rows["s2"]["status"] == "completed"


def test_assignment_of_other_org_is_404(as_user, monkeypatch):
    monkeypatch.setattr(assignment_service, "get_org_assignment", AsyncMock(return_value=None))
    assert as_user("teacher").get("/api/v1/organizations/org-a/assignments/a-other/students").status_code == 404
