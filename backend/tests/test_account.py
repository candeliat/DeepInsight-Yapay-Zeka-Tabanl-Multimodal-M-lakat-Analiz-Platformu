"""
Faz 5 — KVKK veri hakları: verilerimi indir / hesabımı sil.
Gerçek Supabase çağrısı yapılmaz; işlemleri kaydeden sahte bir istemci kullanılır.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_account.py -v
"""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import account_service, cv_service, organization_service


class _Query:
    def __init__(self, db, table):
        self.db, self.table, self.op, self.filters = db, table, "select", []

    def select(self, *a, **k):
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def in_(self, col, vals):
        self.filters.append((col, tuple(vals)))
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a):
        return self

    def execute(self):
        self.db.log.append((self.op, self.table, tuple(self.filters)))
        rows = self.db.data.get(self.table, [])
        return MagicMock(data=rows if self.op == "select" else [{}] * len(rows))


class FakeDB:
    def __init__(self, data):
        self.data, self.log = data, []
        self.auth = MagicMock()

    def table(self, name):
        return _Query(self, name)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB({
        "interviews": [{"id": "i1", "user_id": "u1"}],
        "interview_messages": [{"interview_id": "i1", "role": "user", "content": "merhaba", "created_at": "t1"}],
        "memberships": [{"org_id": "org-a", "role": "candidate", "user_id": "u1"}],
        "organizations": [{"id": "org-a", "name": "Ege Kariyer"}],
    })
    monkeypatch.setattr(account_service, "supabase", fake)
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value={"name": "Ege Kariyer"}))
    monkeypatch.setattr(cv_service, "list_cvs", AsyncMock(return_value=[{"id": "cv1"}]))
    monkeypatch.setattr(cv_service, "delete_cv", AsyncMock(return_value=True))
    return fake


def test_export_includes_interviews_with_messages_and_orgs(db):
    data = asyncio.run(account_service.export_user_data("u1", "u1@x.com", {"profile": {}}))
    assert data["interviews"][0]["messages"] == [{"role": "user", "content": "merhaba", "created_at": "t1"}]
    assert data["organizations"][0]["org_name"] == "Ege Kariyer"
    # Kullanıcıya ait tablolar her zaman kullanıcı kimliğiyle süzülür.
    user_scoped = [entry for entry in db.log if entry[1] in ("interviews", "cvs", "job_postings", "survey_responses")]
    assert user_scoped and all(("user_id", "u1") in entry[2] for entry in user_scoped)


def test_delete_removes_messages_before_interviews_and_auth_user_last(db):
    counts = asyncio.run(account_service.delete_account("u1", "U1@x.com"))
    deletes = [(table, filters) for op, table, filters in db.log if op == "delete"]
    tables = [t for t, _ in deletes]
    assert tables.index("interview_messages") < tables.index("interviews")
    assert ("org_invites", (("email", "u1@x.com"),)) in deletes
    cv_service.delete_cv.assert_awaited_once_with("u1", "cv1")  # depolamadaki dosya da silinir
    db.auth.admin.delete_user.assert_called_once_with("u1")
    assert counts["cvs"] == 1 and counts["interviews"] == 1


def test_last_org_admin_cannot_delete_account(db):
    db.data["memberships"] = [{"org_id": "org-a", "role": "org_admin", "user_id": "u1"}]
    with pytest.raises(account_service.LastAdminError):
        asyncio.run(account_service.delete_account("u1", "u1@x.com"))
    assert not [e for e in db.log if e[0] == "delete"]
    db.auth.admin.delete_user.assert_not_called()


ME = UserProfile(id="u1", email="u1@x.com", created_at="2026-01-01T00:00:00Z", user_metadata={}, app_metadata={})


@pytest.fixture
def client():
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: ME
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_delete_requires_typing_own_email(client, monkeypatch):
    delete = AsyncMock()
    monkeypatch.setattr(account_service, "delete_account", delete)
    resp = client.request("DELETE", "/api/v1/account", json={"confirm_email": "baska@x.com"})
    assert resp.status_code == 422
    delete.assert_not_awaited()


def test_delete_with_matching_email_case_insensitive(client, monkeypatch):
    monkeypatch.setattr(account_service, "delete_account", AsyncMock(return_value={"interviews": 2}))
    resp = client.request("DELETE", "/api/v1/account", json={"confirm_email": " U1@X.com "})
    assert resp.status_code == 200 and resp.json()["deleted"] == {"interviews": 2}


def test_export_endpoint_returns_json_attachment(client, monkeypatch, db):
    import app.api.routes.account as account_route
    monkeypatch.setattr(account_route, "fetch_user_profile", AsyncMock(return_value=ME))
    resp = client.get("/api/v1/account/export")
    assert resp.status_code == 200 and "attachment" in resp.headers["content-disposition"]
    body = json.loads(resp.content.decode("utf-8"))
    assert body["account"]["email"] == "u1@x.com" and body["export_version"] == "1"
