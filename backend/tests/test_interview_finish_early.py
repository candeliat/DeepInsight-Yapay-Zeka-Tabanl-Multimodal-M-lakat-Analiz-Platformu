"""
`POST /api/v1/interview/{interview_id}/finish` uç noktası için entegrasyon
testi — adayın MAX_INTERVIEW_QUESTIONS'a ulaşılmadan erken bitirme isteği.
"""
from unittest.mock import AsyncMock

from app.services.llm_service import llm_service
import app.api.routes.interview as interview_route

from test_interview_chat_flow import client  # noqa: F401


def test_finish_early_forces_evaluation_regardless_of_question_count(client, monkeypatch):
    # Henüz hiç soru sorulmamış (sadece bootstrap turu) — yine de zorlanabilmeli.
    history = [{"role": "user", "content": "Mülakatı başlat.", "created_at": "t0"}]

    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"user_id": "user-1", "role": "Backend Developer", "topic": "Python", "status": "ongoing"}),
    )
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=history))
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(interview_route, "finish_interview_and_evaluate", AsyncMock(return_value={}))
    monkeypatch.setattr(interview_route, "try_claim_interview_finalization", AsyncMock(return_value=True))
    monkeypatch.setattr(interview_route, "release_interview_finalization_claim", AsyncMock(return_value=None))

    eval_mock = AsyncMock(return_value={
        "technical_score": 10, "confidence_score": 15, "vocabulary_score": 5,
        "feedback": "Aday mülakatı erken sonlandırdı, değerlendirilecek yeterli içerik yok.",
    })
    monkeypatch.setattr(llm_service, "get_final_evaluation", eval_mock)
    next_question_mock = AsyncMock(return_value="ÇAĞRILMAMALI")
    monkeypatch.setattr(llm_service, "get_next_question", next_question_mock)

    resp = client.post("/api/v1/interview/interview-1/finish")

    assert resp.status_code == 200
    body = resp.json()
    assert body["interview_complete"] is True
    assert body["evaluation"]["technical_score"] == 10
    assert "erken sonlandırıldı" in body["response"]

    next_question_mock.assert_not_awaited()
    eval_mock.assert_awaited_once()
    interview_route.finish_interview_and_evaluate.assert_awaited_once()


def test_finish_early_returns_409_when_finalization_claim_lost(client, monkeypatch):
    """
    /chat aynı mülakatı tam bu sırada zaten sonlandırıyor olabilir (soru
    sayacı tam bu anda max'a ulaşmış olabilir) — bu durumda claim kaybedilir
    ve pahalı LLM çağrısına hiç girilmeden 409 dönülmeli.
    """
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"user_id": "user-1", "role": "Backend Developer", "topic": "Python", "status": "ongoing"}),
    )
    monkeypatch.setattr(interview_route, "try_claim_interview_finalization", AsyncMock(return_value=False))

    eval_mock = AsyncMock(return_value={"technical_score": 1, "confidence_score": 1, "vocabulary_score": 1, "feedback": "x"})
    monkeypatch.setattr(llm_service, "get_final_evaluation", eval_mock)

    resp = client.post("/api/v1/interview/interview-1/finish")

    assert resp.status_code == 409
    eval_mock.assert_not_awaited()


def test_finish_early_releases_claim_when_final_evaluation_raises(client, monkeypatch):
    """
    Claim kazanıldıktan SONRA `get_final_evaluation` istisna fırlatırsa,
    mülakat skorsuz 'completed' durumunda takılı kalmamalı — claim geri
    alınmalı.
    """
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"user_id": "user-1", "role": "Backend Developer", "topic": "Python", "status": "ongoing"}),
    )
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(interview_route, "try_claim_interview_finalization", AsyncMock(return_value=True))
    release_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(interview_route, "release_interview_finalization_claim", release_mock)
    monkeypatch.setattr(interview_route, "finish_interview_and_evaluate", AsyncMock(return_value={}))

    monkeypatch.setattr(llm_service, "get_final_evaluation", AsyncMock(side_effect=RuntimeError("LLM çöktü")))

    resp = client.post("/api/v1/interview/interview-1/finish")

    assert resp.status_code == 503
    release_mock.assert_awaited_once()
    interview_route.finish_interview_and_evaluate.assert_not_awaited()


def test_finish_early_returns_404_when_interview_missing(client, monkeypatch):
    async def _raise_value_error(*args, **kwargs):
        raise ValueError("not found")
    monkeypatch.setattr(interview_route, "get_interview", _raise_value_error)

    resp = client.post("/api/v1/interview/does-not-exist/finish")
    assert resp.status_code == 404


def test_finish_early_returns_403_for_other_users_interview(client, monkeypatch):
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"user_id": "someone-else", "role": "Backend Developer", "topic": "Python", "status": "ongoing"}),
    )
    resp = client.post("/api/v1/interview/interview-1/finish")
    assert resp.status_code == 403


def test_finish_early_returns_400_when_already_completed(client, monkeypatch):
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"user_id": "user-1", "role": "Backend Developer", "topic": "Python", "status": "completed"}),
    )
    resp = client.post("/api/v1/interview/interview-1/finish")
    assert resp.status_code == 400
