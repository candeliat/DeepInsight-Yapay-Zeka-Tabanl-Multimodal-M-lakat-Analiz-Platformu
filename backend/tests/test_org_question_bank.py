"""
Kuruma özel soru bankası ve kurum bağlamlı mülakat başlatma için testler:
  - kurum yalnızca kendi kapsamında okur/yazar (servis seviyesinde _scope),
  - başka kapsamdaki aileye soru eklenemez,
  - /start kurum üyeliği ve aylık kota kontrolü yapar, org_id'yi aktarır,
  - kurum soru uç noktaları path'teki org_id'yi servise iletir.

Gerçek Supabase/LLM çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_org_question_bank.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.api.routes.interview as interview_route
import app.services.question_bank_admin_service as admin_service
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import organization_service
from app.services.llm_service import llm_service

from test_interview_chat_flow import client, _mock_interview_service  # noqa: F401


def run(coro):
    return asyncio.run(coro)


class _Result:
    def __init__(self, data=None):
        self.data = data or []


def _recording_supabase(rows_for_family=None):
    """Zincirleme sorgu çağrılarını (eq / is_) kaydeden sahte supabase."""
    calls = []
    fake = MagicMock()

    def _table(name):
        t = MagicMock()
        q = MagicMock()
        for method in ("eq", "is_", "order"):
            getattr(q, method).side_effect = lambda *a, _m=method, **k: (calls.append((_m, a)), q)[1]
        q.execute.return_value = _Result(rows_for_family or [{"id": "q1", "question_text": "x"}])
        t.select.return_value = q
        t.update.return_value = q
        t.delete.return_value = q
        t.insert.return_value = q
        return t

    fake.table.side_effect = _table
    fake._calls = calls
    return fake


# --- servis seviyesi kapsam (scope) ---

def test_list_questions_for_org_filters_by_org_id(monkeypatch):
    fake = _recording_supabase()
    monkeypatch.setattr(admin_service, "supabase", fake)
    run(admin_service.list_questions(org_id="org-a"))
    assert ("eq", ("org_id", "org-a")) in fake._calls


def test_list_questions_without_org_is_global_only(monkeypatch):
    fake = _recording_supabase()
    monkeypatch.setattr(admin_service, "supabase", fake)
    run(admin_service.list_questions())
    assert ("is_", ("org_id", "null")) in fake._calls


def test_delete_question_is_pinned_to_org_scope(monkeypatch):
    fake = _recording_supabase()
    monkeypatch.setattr(admin_service, "supabase", fake)
    run(admin_service.delete_question("q1", org_id="org-a"))
    assert ("eq", ("id", "q1")) in fake._calls
    assert ("eq", ("org_id", "org-a")) in fake._calls


def test_update_question_in_other_scope_is_not_found(monkeypatch):
    fake = MagicMock()
    q = MagicMock()
    q.eq.return_value = q
    q.is_.return_value = q
    q.execute.return_value = _Result([])  # kapsam uymadığı için hiçbir satır güncellenmez
    fake.table.return_value.update.return_value = q
    monkeypatch.setattr(admin_service, "supabase", fake)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1]))
    monkeypatch.setattr(admin_service, "embed_text_local_if_ready", MagicMock(return_value=[0.1]))

    with pytest.raises(ValueError):
        run(admin_service.update_question("q-of-org-b", {"is_active": False}, org_id="org-a"))


def test_create_question_rejects_family_from_another_scope(monkeypatch):
    fake = _recording_supabase(rows_for_family=[{"org_id": "org-b"}])
    monkeypatch.setattr(admin_service, "supabase", fake)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1]))
    monkeypatch.setattr(admin_service, "embed_text_local_if_ready", MagicMock(return_value=[0.1]))

    with pytest.raises(ValueError):
        run(admin_service.create_question(
            role="r", topic="t", difficulty=None, question_text="Yeterince uzun bir soru metni",
            tags=[], family_id="fam-of-org-b", new_family=False, org_id="org-a",
        ))


# --- /start: kurum bağlamı ---

def _start_mocks(monkeypatch):
    fetch_pool = AsyncMock(return_value=[])
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", fetch_pool)
    create = AsyncMock(return_value={"id": "interview-1"})
    monkeypatch.setattr(interview_route, "create_interview", create)
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(llm_service, "get_next_question", AsyncMock(return_value="Merhaba!"))
    return fetch_pool, create


def test_start_with_org_passes_org_id_when_member(client, monkeypatch):
    fetch_pool, create = _start_mocks(monkeypatch)
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value={"role": "candidate"}))
    monkeypatch.setattr(organization_service, "check_interview_quota", AsyncMock(return_value=None))

    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "org_id": "org-a"})

    assert resp.status_code == 200
    assert fetch_pool.await_args.kwargs["org_id"] == "org-a"
    assert create.await_args.kwargs["org_id"] == "org-a"


def test_start_with_org_rejects_non_member(client, monkeypatch):
    fetch_pool, create = _start_mocks(monkeypatch)
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value=None))

    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "org_id": "org-b"})

    assert resp.status_code == 403
    create.assert_not_awaited()


def test_start_with_org_returns_429_when_quota_exceeded(client, monkeypatch):
    fetch_pool, create = _start_mocks(monkeypatch)
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value={"role": "candidate"}))
    monkeypatch.setattr(
        organization_service, "check_interview_quota",
        AsyncMock(side_effect=organization_service.QuotaExceededError("kota doldu")),
    )

    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "org_id": "org-a"})

    assert resp.status_code == 429
    create.assert_not_awaited()


def test_start_without_org_skips_membership_and_quota(client, monkeypatch):
    fetch_pool, create = _start_mocks(monkeypatch)
    membership = AsyncMock(return_value=None)
    monkeypatch.setattr(organization_service, "get_membership", membership)

    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python"})

    assert resp.status_code == 200
    membership.assert_not_awaited()
    assert fetch_pool.await_args.kwargs["org_id"] is None


# --- kurum soru uç noktaları ---

@pytest.fixture
def org_client(monkeypatch):
    async def _get_membership(org_id, user_id):
        return {"role": "org_admin"} if (org_id, user_id) == ("org-a", "admin-a") else None

    monkeypatch.setattr(organization_service, "get_membership", _get_membership)
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    user = UserProfile(id="admin-a", email="a@example.com", created_at="2026-01-01T00:00:00Z",
                       user_metadata={}, app_metadata={})
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_org_list_questions_passes_path_org_id(org_client, monkeypatch):
    list_mock = AsyncMock(return_value=[])
    monkeypatch.setattr(admin_service, "list_questions", list_mock)
    assert org_client.get("/api/v1/organizations/org-a/questions").status_code == 200
    list_mock.assert_awaited_once_with(org_id="org-a")


def test_org_cannot_touch_other_org_questions(org_client, monkeypatch):
    delete_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(admin_service, "delete_question", delete_mock)
    assert org_client.get("/api/v1/organizations/org-b/questions").status_code == 403
    assert org_client.delete("/api/v1/organizations/org-b/questions/q1").status_code == 403
    delete_mock.assert_not_awaited()


def test_org_delete_question_scopes_to_org(org_client, monkeypatch):
    delete_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(admin_service, "delete_question", delete_mock)
    assert org_client.delete("/api/v1/organizations/org-a/questions/q1").status_code == 200
    delete_mock.assert_awaited_once_with("q1", org_id="org-a")
