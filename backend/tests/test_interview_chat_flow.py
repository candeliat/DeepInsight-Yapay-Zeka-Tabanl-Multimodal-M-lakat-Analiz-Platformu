"""
`/api/v1/interview/chat` uç noktası için entegrasyon testi.

Asıl amaç: Faz 1'in en kritik düzeltmesini kilitlemek — mülakatın bitip
bitmediğine LLM'in kendi kararı ile DEĞİL, sunucu taraflı soru sayacıyla
karar verildiğini doğrulamak. Supabase ve OpenRouter'a gerçek istek
ATILMAZ; `interview_service` fonksiyonları ve `llm_service` mock'lanır.

Çalıştırmak için (backend/ dizininden):
    pip install -r requirements-dev.txt
    pytest tests/test_interview_chat_flow.py -v
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.services.llm_service import llm_service
import app.api.routes.interview as interview_route


FAKE_USER = UserProfile(id="user-1", email="aday@example.com", created_at="2026-01-01T00:00:00Z", user_metadata={})


def _history_with_n_questions_asked(n: int):
    """Başlangıç bootstrap turu + n adet (soru, cevap) turundan oluşan geçmiş üretir."""
    records = [{"role": "user", "content": "Mülakatı başlat.", "created_at": "t-start"}]
    for i in range(n):
        records.append({"role": "model", "content": f"Soru {i + 1}", "created_at": f"t-q{i}"})
        records.append({"role": "user", "content": f"Cevap {i + 1}", "created_at": f"t-a{i}"})
    return records


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "MAX_INTERVIEW_QUESTIONS", 3)
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _mock_interview_service(monkeypatch, history):
    monkeypatch.setattr(
        interview_route,
        "get_interview",
        AsyncMock(return_value={"role": "Backend Developer", "topic": "Python", "status": "ongoing"}),
    )
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=history))
    monkeypatch.setattr(interview_route, "finish_interview_and_evaluate", AsyncMock(return_value={}))


def test_chat_asks_next_question_when_budget_not_exhausted(client, monkeypatch):
    # MAX_INTERVIEW_QUESTIONS=3, şimdiye kadar 2 soru soruldu -> bir sonraki soru sorulmalı.
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(2))

    next_question_mock = AsyncMock(return_value="Üçüncü soru burada.")
    final_eval_mock = AsyncMock(return_value={"technical_score": 1, "confidence_score": 1, "vocabulary_score": 1, "feedback": "x"})
    monkeypatch.setattr(llm_service, "get_next_question", next_question_mock)
    monkeypatch.setattr(llm_service, "get_final_evaluation", final_eval_mock)

    resp = client.post(
        "/api/v1/interview/chat",
        json={"interview_id": "interview-1", "message": "İkinci soruya cevabım."},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["interview_complete"] is False
    assert body["response"] == "Üçüncü soru burada."
    assert body["evaluation"] is None

    next_question_mock.assert_awaited_once()
    final_eval_mock.assert_not_awaited()
    # question_number = questions_asked(2) + 1 = 3 ile çağrılmış olmalı.
    assert next_question_mock.await_args.kwargs["question_number"] == 3


def test_chat_forces_final_evaluation_when_budget_exhausted(client, monkeypatch):
    # MAX_INTERVIEW_QUESTIONS=3, zaten 3 soru soruldu -> modele YENİ SORU SORDURULMAMALI,
    # doğrudan nihai değerlendirme zorlanmalı (LLM'in kendi "bitti" kararına güvenilmiyor).
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(3))

    next_question_mock = AsyncMock(return_value="BU ASLA ÇAĞRILMAMALI")
    final_eval_mock = AsyncMock(return_value={
        "technical_score": 80, "confidence_score": 70, "vocabulary_score": 75, "feedback": "Genel olarak başarılı.",
    })
    monkeypatch.setattr(llm_service, "get_next_question", next_question_mock)
    monkeypatch.setattr(llm_service, "get_final_evaluation", final_eval_mock)

    resp = client.post(
        "/api/v1/interview/chat",
        json={"interview_id": "interview-1", "message": "Üçüncü soruya son cevabım."},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["interview_complete"] is True
    assert body["evaluation"]["technical_score"] == 80
    assert "Mülakat tamamlandı" in body["response"]

    next_question_mock.assert_not_awaited()
    final_eval_mock.assert_awaited_once()
    interview_route.finish_interview_and_evaluate.assert_awaited_once()


def test_chat_completes_even_when_llm_evaluation_totally_fails(client, monkeypatch):
    """
    get_final_evaluation kendi içinde asla exception fırlatmaz (bkz. test_llm_service.py),
    bu testte route seviyesinde de "asla takılı kalmama" garantisinin uçtan uca
    çalıştığını doğruluyoruz: LLM tamamen çöktüğünde bile route güvenli bir
    varsayılan değerlendirme ile 200 dönmeli, 500/timeout DEĞİL.
    """
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(3))

    from app.services.llm_service import InterviewEvaluation
    monkeypatch.setattr(llm_service, "get_final_evaluation", AsyncMock(return_value=InterviewEvaluation().model_dump()))
    monkeypatch.setattr(llm_service, "get_next_question", AsyncMock(return_value="ÇAĞRILMAMALI"))

    resp = client.post(
        "/api/v1/interview/chat",
        json={"interview_id": "interview-1", "message": "Son cevap."},
    )

    assert resp.status_code == 200
    assert resp.json()["interview_complete"] is True


def test_chat_rejects_empty_message_with_422(client, monkeypatch):
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(0))

    resp = client.post("/api/v1/interview/chat", json={"interview_id": "interview-1", "message": ""})

    # Pydantic Field(min_length=1) istek gövdesi ayrıştırılırken 422 döner
    # (route fonksiyonu hiç çalışmaz); boş mesajın hiçbir şekilde LLM'e
    # ulaşmaması asıl kontrol edilen şey.
    assert resp.status_code == 422


def test_chat_returns_400_when_interview_already_completed(client, monkeypatch):
    monkeypatch.setattr(
        interview_route,
        "get_interview",
        AsyncMock(return_value={"role": "Backend Developer", "topic": "Python", "status": "completed"}),
    )
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=[]))

    resp = client.post(
        "/api/v1/interview/chat",
        json={"interview_id": "interview-1", "message": "Merhaba"},
    )

    assert resp.status_code == 400
