"""
Mülakat sohbet akışının iş kuralları (`/api/v1/interview/chat/stream`).

Asıl amaç: Faz 1'in en kritik düzeltmesini kilitlemek — mülakatın bitip
bitmediğine LLM'in kendi kararı ile DEĞİL, sunucu taraflı soru sayacıyla
karar verildiğini doğrulamak. Supabase ve LLM'e gerçek istek ATILMAZ;
`interview_service` fonksiyonları ve `llm_service` mock'lanır.

Not: Bu testler önceden akışsız `/chat` uç noktası üzerinden yazılmıştı. İki istemci
de yalnızca akışlı uç noktayı kullandığı için `/chat` kaldırıldı ve testler buraya
taşındı. Bu dosyadaki `client` fixture'ı ve yardımcılar diğer mülakat testlerinde de
kullanılır.

Çalıştırmak için (backend/ dizininden):
    pip install -r requirements-dev.txt
    pytest tests/test_interview_chat_flow.py -v
"""
import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.services.llm_service import llm_service, InterviewEvaluation
import app.api.routes.interview as interview_route


FAKE_USER = UserProfile(id="user-1", email="aday@example.com", created_at="2026-01-01T00:00:00Z", user_metadata={})
STREAM_URL = "/api/v1/interview/chat/stream"


def _history_with_n_questions_asked(n: int):
    """Başlangıç bootstrap turu + n adet (soru, cevap) turundan oluşan geçmiş üretir."""
    records = [{"role": "user", "content": "Mülakatı başlat.", "created_at": "t-start"}]
    for i in range(n):
        records.append({"role": "model", "content": f"Soru {i + 1}", "created_at": f"t-q{i}"})
        records.append({"role": "user", "content": f"Cevap {i + 1}", "created_at": f"t-a{i}"})
    return records


def _parse_sse_events(raw_text: str) -> list[tuple[str, object]]:
    events = []
    for block in raw_text.replace("\r\n", "\n").strip().split("\n\n"):
        if not block.strip():
            continue
        event_type = None
        data_raw = None
        for line in block.splitlines():
            if line.startswith("event:"):
                event_type = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data_raw = line[len("data:"):].strip()
        if event_type is not None and data_raw is not None:
            events.append((event_type, json.loads(data_raw)))
    return events


def _stream_events(client, message: str) -> list[tuple[str, object]]:
    with client.stream("POST", STREAM_URL, json={"interview_id": "interview-1", "message": message}) as resp:
        assert resp.status_code == 200
        return _parse_sse_events("".join(resp.iter_text()))


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
        AsyncMock(return_value={"user_id": "user-1", "role": "Backend Developer", "topic": "Python", "status": "ongoing"}),
    )
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=history))
    monkeypatch.setattr(interview_route, "finish_interview_and_evaluate", AsyncMock(return_value={}))
    monkeypatch.setattr(interview_route, "try_claim_interview_finalization", AsyncMock(return_value=True))
    monkeypatch.setattr(interview_route, "release_interview_finalization_claim", AsyncMock(return_value=None))


def test_next_question_is_requested_with_server_side_question_number(client, monkeypatch):
    # MAX_INTERVIEW_QUESTIONS=3, şimdiye kadar 2 soru soruldu -> 3. soru istenmeli.
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(2))
    seen = {}

    async def _fake_stream(*args, **kwargs):
        seen.update(kwargs)
        yield "Üçüncü soru burada."

    monkeypatch.setattr(llm_service, "stream_next_question", _fake_stream)
    final_eval_mock = AsyncMock()
    monkeypatch.setattr(llm_service, "get_final_evaluation", final_eval_mock)

    events = _stream_events(client, "İkinci soruya cevabım.")

    assert events[-1] == ("done", {"interview_complete": False, "evaluation": None})
    assert seen["question_number"] == 3
    final_eval_mock.assert_not_awaited()


def test_interview_completes_even_when_llm_evaluation_totally_fails(client, monkeypatch):
    """
    get_final_evaluation kendi içinde asla exception fırlatmaz (bkz. test_llm_service.py):
    LLM tamamen çöktüğünde güvenli varsayılan değerlendirmeyi döner. Route da bu durumda
    mülakatı tamamlamalı; kullanıcı "takılı" bir mülakatla kalmamalı.
    """
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(3))
    monkeypatch.setattr(llm_service, "get_final_evaluation", AsyncMock(return_value=InterviewEvaluation().model_dump()))

    events = _stream_events(client, "Son cevap.")

    assert events[-1][0] == "done"
    assert events[-1][1]["interview_complete"] is True
    interview_route.finish_interview_and_evaluate.assert_awaited_once()


def test_claim_is_released_when_final_evaluation_raises(client, monkeypatch):
    """
    Claim kazanıldıktan SONRA değerlendirme beklenmedik bir istisna fırlatırsa (ör. ağ
    hatası), mülakat kalıcı olarak skorsuz 'completed' durumunda takılı kalmamalı —
    claim geri alınmalı ki kullanıcı tekrar deneyebilsin.
    """
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(3))
    monkeypatch.setattr(llm_service, "get_final_evaluation", AsyncMock(side_effect=RuntimeError("LLM çöktü")))

    events = _stream_events(client, "Üçüncü soruya son cevabım.")

    assert events[-1][0] == "error"
    interview_route.release_interview_finalization_claim.assert_awaited_once()
    interview_route.finish_interview_and_evaluate.assert_not_awaited()


def test_empty_message_is_rejected_with_422(client, monkeypatch):
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(0))

    resp = client.post(STREAM_URL, json={"interview_id": "interview-1", "message": "   "})

    # Boş/yalnızca boşluk mesaj istek ayrıştırılırken reddedilir; LLM'e hiç ulaşmaz.
    assert resp.status_code == 422
    interview_route.save_message.assert_not_awaited()


def test_returns_400_when_interview_already_completed(client, monkeypatch):
    _mock_interview_service(monkeypatch, [])
    monkeypatch.setattr(
        interview_route,
        "get_interview",
        AsyncMock(return_value={"user_id": "user-1", "role": "Backend Developer", "topic": "Python", "status": "completed"}),
    )

    resp = client.post(STREAM_URL, json={"interview_id": "interview-1", "message": "Merhaba"})

    assert resp.status_code == 400
    interview_route.save_message.assert_not_awaited()
