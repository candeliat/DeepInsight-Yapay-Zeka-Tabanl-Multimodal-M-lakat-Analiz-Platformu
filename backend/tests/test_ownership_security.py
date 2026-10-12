"""
Faz 5 öncesi güvenlik taramasında bulunan açıkların regresyon testleri.

Veritabanı erişimi service_role ile olduğundan (RLS'i aşar), bir kullanıcının
başka birinin mülakatına erişememesinin TEK güvencesi route'lardaki sahiplik
kontrolüdür. Bu testler o kontrolü her uç nokta için kilitler.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_ownership_security.py -v
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.api.routes.analytics as analytics_route
import app.api.routes.interview as interview_route
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app

ME = UserProfile(id="user-1", email="aday@example.com", created_at="2026-01-01T00:00:00Z", user_metadata={})
FOREIGN = {"id": "inv-x", "user_id": "someone-else", "role": "Backend", "topic": "Python", "status": "ongoing"}
OTHER_UUID = "6f1c3c1e-8a4b-4f0e-9a51-0c2f6a1d9b77"


@pytest.fixture
def client():
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: ME
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def foreign_interview(monkeypatch):
    save = AsyncMock(return_value={})
    monkeypatch.setattr(interview_route, "get_interview", AsyncMock(return_value=FOREIGN))
    monkeypatch.setattr(interview_route, "save_message", save)
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=[]))
    return save


@pytest.mark.parametrize("path", ["/api/v1/interview/chat", "/api/v1/interview/chat/stream"])
def test_cannot_chat_in_someone_elses_interview(client, foreign_interview, path):
    resp = client.post(path, json={"interview_id": "inv-x", "message": "merhaba"})
    assert resp.status_code == 404
    foreign_interview.assert_not_awaited()  # başkasının mülakatına mesaj yazılmadı


def test_cannot_read_someone_elses_interview_detail(client, foreign_interview):
    assert client.get("/api/v1/interview/inv-x").status_code == 404


def _analytics_db(owner_id):
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"user_id": owner_id, "interview_id": OTHER_UUID, "analysis_status": "processing"}] if owner_id else [])
    return fake


@pytest.mark.parametrize("path", [f"/api/v1/analytics/status/{OTHER_UUID}", f"/api/v1/analytics/results/{OTHER_UUID}"])
def test_cannot_read_someone_elses_video_analysis(client, monkeypatch, path):
    monkeypatch.setattr(analytics_route, "supabase", _analytics_db("someone-else"))
    assert client.get(path).status_code == 404


def test_cannot_upload_analysis_for_someone_elses_interview(client, monkeypatch):
    monkeypatch.setattr(analytics_route, "supabase", _analytics_db("someone-else"))
    run = MagicMock()
    monkeypatch.setattr(analytics_route, "run_full_analysis", run)
    resp = client.post(f"/api/v1/analytics/analyze/{OTHER_UUID}", files={"file": ("a.webm", b"x", "video/webm")})
    assert resp.status_code == 404
    run.assert_not_called()


def test_non_uuid_interview_id_is_rejected_before_touching_files(client, monkeypatch):
    # "..\\..\\x" gibi bir değer dosya adına girip geçici klasörün dışına yazabilirdi.
    monkeypatch.setattr(analytics_route, "supabase", _analytics_db("user-1"))
    resp = client.post("/api/v1/analytics/analyze/..%5C..%5Cevil", files={"file": ("a.webm", b"x", "video/webm")})
    assert resp.status_code == 404


def test_owner_can_read_own_analysis_status(client, monkeypatch):
    fake = _analytics_db("user-1")
    monkeypatch.setattr(analytics_route, "supabase", fake)
    assert client.get(f"/api/v1/analytics/status/{OTHER_UUID}").status_code == 200
