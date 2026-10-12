"""
Kullanılabilirlik taramasında bulunan eksikler için eklenen uç noktaların testleri:
video analizi onamı, yarıda kalan mülakatı silme, kayıtta aydınlatma onayı,
şifre sıfırlama/değiştirme ve profil güncelleme. Gerçek Supabase çağrısı yapılmaz.
"""
from unittest.mock import AsyncMock, MagicMock

import asyncio
import pytest
from fastapi.testclient import TestClient

import app.api.routes.analytics as analytics_route
import app.api.routes.auth as auth_route
import app.api.routes.interview as interview_route
import app.api.routes.users as users_route
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import account_service, organization_service

ME = UserProfile(id="user-1", email="u1@x.com", created_at="2026-01-01T00:00:00Z",
                 user_metadata={"first_name": "Ali"}, app_metadata={})
INTERVIEW_ID = "6f1c3c1e-8a4b-4f0e-9a51-0c2f6a1d9b77"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: ME
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- video onamı ---

def test_video_upload_requires_consent(client, monkeypatch):
    own = MagicMock()
    own.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"user_id": "user-1"}])
    monkeypatch.setattr(analytics_route, "supabase", own)
    monkeypatch.setattr(account_service, "has_video_consent", lambda uid: False)
    run = MagicMock()
    monkeypatch.setattr(analytics_route, "run_full_analysis", run)
    resp = client.post(f"/api/v1/analytics/analyze/{INTERVIEW_ID}", files={"file": ("a.webm", b"x", "video/webm")})
    assert resp.status_code == 403
    run.assert_not_called()


def test_revoking_video_consent_deletes_analytics(monkeypatch):
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "i1"}])
    monkeypatch.setattr(account_service, "supabase", fake)
    asyncio.run(account_service.set_consent("user-1", account_service.VIDEO_CONSENT_TYPE, False))
    tables = [c.args[0] for c in fake.table.call_args_list]
    assert "interview_analytics" in tables
    fake.table.return_value.delete.return_value.in_.assert_called_with("interview_id", ["i1"])


def test_unknown_consent_type_is_404(client):
    assert client.get("/api/v1/account/consents/marketing").status_code == 404


# --- yarıda kalan mülakat ---

def _interview(status):
    return {"id": "inv-1", "user_id": "user-1", "status": status, "role": "FE", "topic": "React"}


def test_can_delete_own_ongoing_interview(client, monkeypatch):
    monkeypatch.setattr(interview_route, "get_interview", AsyncMock(return_value=_interview("ongoing")))
    delete = AsyncMock()
    monkeypatch.setattr(interview_route, "delete_ongoing_interview", delete)
    assert client.delete("/api/v1/interview/inv-1").status_code == 200
    delete.assert_awaited_once_with("inv-1")


def test_cannot_delete_completed_interview(client, monkeypatch):
    monkeypatch.setattr(interview_route, "get_interview", AsyncMock(return_value=_interview("completed")))
    delete = AsyncMock()
    monkeypatch.setattr(interview_route, "delete_ongoing_interview", delete)
    assert client.delete("/api/v1/interview/inv-1").status_code == 409
    delete.assert_not_awaited()


def test_cannot_delete_someone_elses_interview(client, monkeypatch):
    other = {**_interview("ongoing"), "user_id": "someone-else"}
    monkeypatch.setattr(interview_route, "get_interview", AsyncMock(return_value=other))
    assert client.delete("/api/v1/interview/inv-1").status_code == 404


# --- kayıt ve şifre ---

def test_register_requires_privacy_notice(client):
    resp = client.post("/api/v1/auth/register", json={"email": "a@b.co", "password": "Uzun-sifre-1"})
    assert resp.status_code == 422


def test_register_rejects_short_password(client):
    resp = client.post("/api/v1/auth/register", json={"email": "a@b.co", "password": "123", "privacy_accepted": True})
    assert resp.status_code == 422


def test_forgot_password_does_not_reveal_accounts(client, monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("User not found")
    fake_client = MagicMock()
    fake_client.auth.reset_password_for_email.side_effect = _boom
    monkeypatch.setattr("supabase.create_client", lambda *a, **k: fake_client)
    resp = client.post("/api/v1/auth/forgot-password", json={"email": "yok@x.com"})
    assert resp.status_code == 200 and "varsa" in resp.json()["message"]


def test_reset_password_with_invalid_token(client, monkeypatch):
    fake = MagicMock()
    fake.auth.get_user.side_effect = RuntimeError("invalid JWT")
    monkeypatch.setattr(auth_route, "supabase", fake)
    resp = client.post("/api/v1/auth/reset-password", json={"access_token": "x" * 20, "new_password": "Yeni-sifre-1"})
    assert resp.status_code == 401
    fake.auth.admin.update_user_by_id.assert_not_called()


def test_change_password_checks_current_password(client, monkeypatch):
    fake_client = MagicMock()
    fake_client.auth.sign_in_with_password.side_effect = RuntimeError("Invalid login credentials")
    monkeypatch.setattr("supabase.create_client", lambda *a, **k: fake_client)
    admin = MagicMock()
    monkeypatch.setattr(auth_route, "supabase", admin)
    resp = client.post("/api/v1/auth/change-password", json={"current_password": "yanlis", "new_password": "Yeni-sifre-1"})
    assert resp.status_code == 400
    admin.auth.admin.update_user_by_id.assert_not_called()


# --- profil ---

def test_update_profile_merges_metadata(client, monkeypatch):
    fake = MagicMock()
    monkeypatch.setattr(users_route, "supabase", fake)
    # Birleştirme token'daki değil, Supabase'den okunan GÜNCEL metadata üzerinden yapılır.
    monkeypatch.setattr(users_route, "fetch_user_profile", AsyncMock(return_value=ME))
    resp = client.patch("/api/v1/users/me", json={"target": "  Backend <Developer> "})
    assert resp.status_code == 200
    meta = resp.json()["user_metadata"]
    assert meta == {"first_name": "Ali", "target": "Backend Developer"}
    fake.auth.admin.update_user_by_id.assert_called_once_with("user-1", {"user_metadata": meta})
