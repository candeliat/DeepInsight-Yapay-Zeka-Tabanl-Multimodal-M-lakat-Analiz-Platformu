"""
`/api/v1/interview/chat/stream` SSE (Server-Sent Events) uç noktası için
entegrasyon testi (Faz 4 — streaming yanıt).

`client` fixture'ı ve mock yardımcıları test_interview_chat_flow.py'den
yeniden kullanılıyor (aynı auth/dependency-override kurulumu).
"""
import json
from unittest.mock import AsyncMock

from app.services.llm_service import llm_service
import app.api.routes.interview as interview_route

from test_interview_chat_flow import client, _mock_interview_service, _history_with_n_questions_asked  # noqa: F401


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


async def _fake_stream_ok(*args, **kwargs):
    for part in ["Bir ", "sonraki ", "soru burada."]:
        yield part


async def _fake_stream_crashes_after_one_chunk(*args, **kwargs):
    yield "yarım kalan "
    raise RuntimeError("Yanıt üretimi yarıda kesildi: bağlantı koptu")


async def _fake_stream_fails_immediately(*args, **kwargs):
    raise RuntimeError("AI servisi ile iletişim kurulamadı. Tüm modeller meşgul.")
    yield  # pragma: no cover - jenerik olması için (asla ulaşılmaz)


def test_stream_yields_chunks_then_done_when_budget_not_exhausted(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(1))
    monkeypatch.setattr(llm_service, "stream_next_question", _fake_stream_ok)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "cevabım"},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    chunk_events = [e for e in events if e[0] == "chunk"]
    done_events = [e for e in events if e[0] == "done"]

    assert [c[1] for c in chunk_events] == ["Bir ", "sonraki ", "soru burada."]
    assert len(done_events) == 1
    assert done_events[0][1] == {"interview_complete": False, "evaluation": None}

    # Tam birleşik metin DB'ye TEK bir 'model' mesajı olarak kaydedilmeli.
    saved_calls = interview_route.save_message.await_args_list
    model_saves = [c for c in saved_calls if c.kwargs.get("role") == "model"]
    assert len(model_saves) == 1
    assert model_saves[0].kwargs["content"] == "Bir sonraki soru burada."


def test_stream_forces_final_evaluation_when_budget_exhausted(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(3))

    eval_mock = AsyncMock(return_value={
        "technical_score": 60, "confidence_score": 70, "vocabulary_score": 65, "feedback": "İyi bir performans.",
    })
    monkeypatch.setattr(llm_service, "get_final_evaluation", eval_mock)
    # stream_next_question hiç çağrılmamalı; çağrılırsa test'i patlat.
    async def _must_not_be_called(*args, **kwargs):
        raise AssertionError("Bütçe dolmuşken stream_next_question çağrılmamalı")
        yield  # pragma: no cover
    monkeypatch.setattr(llm_service, "stream_next_question", _must_not_be_called)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "son cevabım"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    done_events = [e for e in events if e[0] == "done"]
    assert len(done_events) == 1
    assert done_events[0][1]["interview_complete"] is True
    assert done_events[0][1]["evaluation"]["technical_score"] == 60
    interview_route.finish_interview_and_evaluate.assert_awaited_once()


def test_stream_saves_partial_text_and_emits_error_when_stream_crashes_midway(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(1))
    monkeypatch.setattr(llm_service, "stream_next_question", _fake_stream_crashes_after_one_chunk)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "cevabım"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    assert events[0] == ("chunk", "yarım kalan ")
    error_events = [e for e in events if e[0] == "error"]
    assert len(error_events) == 1
    assert error_events[0][1]["partial_saved"] is True

    # Yarım kalan metin yine de DB'ye kaydedilmiş olmalı (client'ın gördüğüyle tutarlı).
    saved_calls = interview_route.save_message.await_args_list
    model_saves = [c for c in saved_calls if c.kwargs.get("role") == "model"]
    assert len(model_saves) == 1
    assert model_saves[0].kwargs["content"] == "yarım kalan "


def test_stream_emits_error_without_saving_when_all_models_fail_immediately(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(1))
    monkeypatch.setattr(llm_service, "stream_next_question", _fake_stream_fails_immediately)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "cevabım"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    assert len(events) == 1
    assert events[0][0] == "error"
    assert events[0][1]["partial_saved"] is False

    saved_calls = interview_route.save_message.await_args_list
    model_saves = [c for c in saved_calls if c.kwargs.get("role") == "model"]
    assert len(model_saves) == 0


def test_stream_emits_error_when_finalization_claim_lost(client, monkeypatch):
    """
    Eş zamanlı ikinci bir final istek (claim kaybedilir) durumunda, stream
    hiç LLM'e sormadan bir `error` event'i yayıp bitmeli.
    """
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(3))
    monkeypatch.setattr(interview_route, "try_claim_interview_finalization", AsyncMock(return_value=False))

    eval_mock = AsyncMock(return_value={
        "technical_score": 1, "confidence_score": 1, "vocabulary_score": 1, "feedback": "x",
    })
    monkeypatch.setattr(llm_service, "get_final_evaluation", eval_mock)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "son cevabım"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    assert len(events) == 1
    assert events[0][0] == "error"
    eval_mock.assert_not_awaited()


def test_stream_returns_404_before_streaming_when_interview_missing(client, monkeypatch):
    async def _raise_value_error(*args, **kwargs):
        raise ValueError("not found")
    monkeypatch.setattr(interview_route, "get_interview", _raise_value_error)

    resp = client.post(
        "/api/v1/interview/chat/stream",
        json={"interview_id": "does-not-exist", "message": "cevabım"},
    )
    assert resp.status_code == 404
