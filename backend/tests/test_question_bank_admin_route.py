"""
`/api/v1/question-bank/*` yönetim uç noktaları için entegrasyon testi.
Gerçek Supabase/embedding çağrısı YAPILMAZ — `question_bank_admin_service`
fonksiyonları mock'lanır.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_question_bank_admin_route.py -v
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
import app.api.routes.question_bank_admin as route

FAKE_USER = UserProfile(id="user-1", email="aday@example.com", created_at="2026-01-01T00:00:00Z", user_metadata={})


@pytest.fixture
def client():
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _question_row(**overrides):
    base = {
        "id": "q-1", "role": "Backend Developer", "topic": "Python", "difficulty": "ORTA",
        "question_text": "GIL nedir?", "tags": [], "family_id": None,
        "times_served": 0, "is_active": True, "created_at": "2026-01-01T00:00:00Z",
    }
    base.update(overrides)
    return base


def test_list_questions_returns_service_result(client, monkeypatch):
    monkeypatch.setattr(route.admin_service, "list_questions", AsyncMock(return_value=[_question_row()]))

    resp = client.get("/api/v1/question-bank/questions")

    assert resp.status_code == 200
    assert resp.json()[0]["question_text"] == "GIL nedir?"


def test_create_question_success(client, monkeypatch):
    create_mock = AsyncMock(return_value=_question_row())
    monkeypatch.setattr(route.admin_service, "create_question", create_mock)

    resp = client.post("/api/v1/question-bank/questions", json={
        "role": "Backend Developer", "topic": "Python", "difficulty": "orta",
        "question_text": "GIL nedir ve threading'i nasıl etkiler?",
    })

    assert resp.status_code == 200
    create_mock.assert_awaited_once()
    # difficulty küçük harften büyük harfe normalize edilmiş olmalı.
    assert create_mock.await_args.kwargs["difficulty"] == "ORTA"


def test_create_question_rejects_invalid_difficulty(client):
    resp = client.post("/api/v1/question-bank/questions", json={
        "role": "Backend Developer", "topic": "Python", "difficulty": "IMKANSIZ",
        "question_text": "GIL nedir ve threading'i nasıl etkiler?",
    })
    assert resp.status_code == 422


def test_create_question_rejects_too_short_text(client):
    resp = client.post("/api/v1/question-bank/questions", json={
        "role": "Backend Developer", "topic": "Python", "question_text": "kısa",
    })
    assert resp.status_code == 422


def test_create_question_returns_503_when_embedding_fails(client, monkeypatch):
    monkeypatch.setattr(
        route.admin_service, "create_question",
        AsyncMock(side_effect=RuntimeError("AI servisi ile iletişim kurulamadı.")),
    )
    resp = client.post("/api/v1/question-bank/questions", json={
        "role": "Backend Developer", "topic": "Python",
        "question_text": "GIL nedir ve threading'i nasıl etkiler?",
    })
    assert resp.status_code == 503


def test_update_question_success(client, monkeypatch):
    update_mock = AsyncMock(return_value=_question_row(question_text="Güncellenmiş soru"))
    monkeypatch.setattr(route.admin_service, "update_question", update_mock)

    resp = client.patch("/api/v1/question-bank/questions/q-1", json={"question_text": "Güncellenmiş soru"})

    assert resp.status_code == 200
    assert resp.json()["question_text"] == "Güncellenmiş soru"


def test_update_question_returns_404_when_not_found(client, monkeypatch):
    monkeypatch.setattr(route.admin_service, "update_question", AsyncMock(side_effect=ValueError("Soru bulunamadı")))

    resp = client.patch("/api/v1/question-bank/questions/does-not-exist", json={"is_active": False})

    assert resp.status_code == 404


def test_delete_question_success(client, monkeypatch):
    delete_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(route.admin_service, "delete_question", delete_mock)

    resp = client.delete("/api/v1/question-bank/questions/q-1")

    assert resp.status_code == 200
    delete_mock.assert_awaited_once_with("q-1")


def test_list_gaps_returns_service_result(client, monkeypatch):
    gap_row = {
        "id": "g-1", "role": "Uzay Mühendisi", "topic": "Roket", "difficulty": "UZMAN",
        "miss_count": 3, "last_missing_count": 2, "last_seen_at": "2026-01-01T00:00:00Z",
    }
    monkeypatch.setattr(route.admin_service, "list_gaps", AsyncMock(return_value=[gap_row]))

    resp = client.get("/api/v1/question-bank/gaps")

    assert resp.status_code == 200
    assert resp.json()[0]["miss_count"] == 3
