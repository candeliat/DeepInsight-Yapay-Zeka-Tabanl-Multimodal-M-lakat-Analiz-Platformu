"""
Soru bankası (RAG) hibrit akışının `/start`, `/chat` ve `/chat/stream`
uç noktalarına doğru bağlandığını doğrulayan entegrasyon testleri.

Gerçek Supabase/embedding/LLM çağrısı YAPILMAZ — `question_bank_service`,
`create_interview` ve `llm_service` fonksiyonları mock'lanır. `client` fixture'ı
ve `_mock_interview_service` test_interview_chat_flow.py'den yeniden kullanılır
(aynı auth/dependency-override kurulumu).

Önemli: bu dosyadaki testler, havuzda karşılığı OLMAYAN turlarda mevcut
tam-üretim davranışının (get_next_question / stream_next_question) hiç
bozulmadığını da doğrular — bkz. test_interview_chat_flow.py ve
test_interview_chat_stream.py'deki mevcut testler zaten `question_pool`
anahtarı olmayan interview mock'larıyla çalışıyor, bu geriye dönük uyumluluğu
zımnen doğruluyor.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_question_bank_route_integration.py -v
"""
import json
from unittest.mock import AsyncMock

from app.services.llm_service import llm_service
import app.api.routes.interview as interview_route

from test_interview_chat_flow import client, _mock_interview_service, _history_with_n_questions_asked  # noqa: F401
from test_interview_chat_stream import _parse_sse_events  # noqa: F401


# --- /start ---

def test_start_uses_bank_delivery_when_pool_has_first_candidate(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)

    pool = [
        {"id": "q1", "question_text": "Bankadan gelen ilk soru.", "similarity": 0.8},
        {"id": "q2", "question_text": "Bankadan gelen ikinci soru.", "similarity": 0.7},
    ]
    fetch_pool_mock = AsyncMock(return_value=pool)
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", fetch_pool_mock)

    create_interview_mock = AsyncMock(return_value={"id": "interview-1"})
    monkeypatch.setattr(interview_route, "create_interview", create_interview_mock)
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))

    deliver_mock = AsyncMock(return_value="Merhaba! Bankadan gelen ilk soru.")
    monkeypatch.setattr(llm_service, "deliver_bank_question", deliver_mock)
    get_next_question_mock = AsyncMock(return_value="ASLA ÇAĞRILMAMALI")
    monkeypatch.setattr(llm_service, "get_next_question", get_next_question_mock)

    resp = client.post(
        "/api/v1/interview/start",
        json={"role": "Backend Developer", "topic": "Python", "difficulty": "orta"},
    )

    assert resp.status_code == 200
    assert resp.json()["first_message"] == "Merhaba! Bankadan gelen ilk soru."

    get_next_question_mock.assert_not_awaited()
    deliver_mock.assert_awaited_once()
    assert deliver_mock.await_args.kwargs["bank_question_text"] == "Bankadan gelen ilk soru."
    assert deliver_mock.await_args.kwargs["question_number"] == 1

    # difficulty küçük harften büyük harfe normalize edilip fetch_question_pool'a geçmeli.
    fetch_pool_mock.assert_awaited_once()
    assert fetch_pool_mock.await_args.kwargs["difficulty"] == "ORTA"
    assert fetch_pool_mock.await_args.kwargs["size"] == 3

    # create_interview'a difficulty + havuz kaydedilmek üzere geçmeli.
    create_interview_mock.assert_awaited_once()
    assert create_interview_mock.await_args.kwargs["difficulty"] == "ORTA"
    assert create_interview_mock.await_args.kwargs["question_pool"] == pool


def test_start_falls_back_to_generation_when_pool_empty(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", AsyncMock(return_value=[]))
    monkeypatch.setattr(interview_route, "create_interview", AsyncMock(return_value={"id": "interview-1"}))
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))

    deliver_mock = AsyncMock(return_value="ASLA ÇAĞRILMAMALI")
    monkeypatch.setattr(llm_service, "deliver_bank_question", deliver_mock)
    get_next_question_mock = AsyncMock(return_value="Sıfırdan üretilmiş ilk soru.")
    monkeypatch.setattr(llm_service, "get_next_question", get_next_question_mock)

    resp = client.post(
        "/api/v1/interview/start",
        json={"role": "Backend Developer", "topic": "Python"},
    )

    assert resp.status_code == 200
    assert resp.json()["first_message"] == "Sıfırdan üretilmiş ilk soru."
    deliver_mock.assert_not_awaited()
    get_next_question_mock.assert_awaited_once()


def test_start_falls_back_to_generation_when_bank_delivery_raises(client, monkeypatch):
    """Havuzda aday olsa bile deliver_bank_question başarısız olursa mülakat
    hiçbir şekilde kesintiye uğramamalı — get_next_question'a düşülmeli."""
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    pool = [{"id": "q1", "question_text": "Bankadan gelen soru.", "similarity": 0.9}]
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(interview_route, "create_interview", AsyncMock(return_value={"id": "interview-1"}))
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))

    monkeypatch.setattr(llm_service, "deliver_bank_question", AsyncMock(side_effect=RuntimeError("model meşgul")))
    get_next_question_mock = AsyncMock(return_value="Yedek olarak üretilen soru.")
    monkeypatch.setattr(llm_service, "get_next_question", get_next_question_mock)

    resp = client.post(
        "/api/v1/interview/start",
        json={"role": "Backend Developer", "topic": "Python"},
    )

    assert resp.status_code == 200
    assert resp.json()["first_message"] == "Yedek olarak üretilen soru."
    get_next_question_mock.assert_awaited_once()


# --- /chat ---

def test_chat_uses_bank_delivery_for_matching_pool_index(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    # 1 soru soruldu -> questions_asked=1 -> pool[1] kullanılmalı (2. soru).
    history = _history_with_n_questions_asked(1)
    _mock_interview_service(monkeypatch, history)

    pool = [
        {"id": "q1", "question_text": "Birinci havuz sorusu.", "similarity": 0.8},
        {"id": "q2", "question_text": "İkinci havuz sorusu.", "similarity": 0.75},
    ]
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"role": "Backend Developer", "topic": "Python", "status": "ongoing", "question_pool": pool}),
    )

    deliver_mock = AsyncMock(return_value="Güzel cevap! İkinci havuz sorusu.")
    monkeypatch.setattr(llm_service, "deliver_bank_question", deliver_mock)
    get_next_question_mock = AsyncMock(return_value="ASLA ÇAĞRILMAMALI")
    monkeypatch.setattr(llm_service, "get_next_question", get_next_question_mock)

    resp = client.post(
        "/api/v1/interview/chat",
        json={"interview_id": "interview-1", "message": "cevabım"},
    )

    assert resp.status_code == 200
    assert resp.json()["response"] == "Güzel cevap! İkinci havuz sorusu."
    get_next_question_mock.assert_not_awaited()
    deliver_mock.assert_awaited_once()
    assert deliver_mock.await_args.kwargs["bank_question_text"] == "İkinci havuz sorusu."
    assert deliver_mock.await_args.kwargs["question_number"] == 2


def test_chat_falls_back_to_generation_when_pool_exhausted(client, monkeypatch):
    """Havuz 1 soru içeriyor ama zaten 1 soru soruldu (index 1 için karşılık
    yok) -> tam-üretim akışına düşülmeli, mülakat kesintiye uğramamalı."""
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    history = _history_with_n_questions_asked(1)
    _mock_interview_service(monkeypatch, history)

    pool = [{"id": "q1", "question_text": "Sadece bir soru.", "similarity": 0.8}]
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"role": "Backend Developer", "topic": "Python", "status": "ongoing", "question_pool": pool}),
    )

    deliver_mock = AsyncMock(return_value="ASLA ÇAĞRILMAMALI")
    monkeypatch.setattr(llm_service, "deliver_bank_question", deliver_mock)
    get_next_question_mock = AsyncMock(return_value="Sıfırdan üretilen ikinci soru.")
    monkeypatch.setattr(llm_service, "get_next_question", get_next_question_mock)

    resp = client.post(
        "/api/v1/interview/chat",
        json={"interview_id": "interview-1", "message": "cevabım"},
    )

    assert resp.status_code == 200
    assert resp.json()["response"] == "Sıfırdan üretilen ikinci soru."
    deliver_mock.assert_not_awaited()
    get_next_question_mock.assert_awaited_once()


# --- /chat/stream ---

def test_stream_uses_bank_delivery_when_pool_has_candidate(client, monkeypatch):
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    history = _history_with_n_questions_asked(1)
    _mock_interview_service(monkeypatch, history)

    pool = [
        {"id": "q1", "question_text": "Birinci havuz sorusu.", "similarity": 0.8},
        {"id": "q2", "question_text": "İkinci havuz sorusu.", "similarity": 0.75},
    ]
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"role": "Backend Developer", "topic": "Python", "status": "ongoing", "question_pool": pool}),
    )

    async def _fake_bank_stream(*args, **kwargs):
        for part in ["Güzel ", "cevap! İkinci havuz sorusu."]:
            yield part
    monkeypatch.setattr(llm_service, "stream_deliver_bank_question", _fake_bank_stream)

    async def _must_not_be_called(*args, **kwargs):
        raise AssertionError("Havuzda aday varken stream_next_question çağrılmamalı")
        yield  # pragma: no cover
    monkeypatch.setattr(llm_service, "stream_next_question", _must_not_be_called)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "cevabım"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    chunk_events = [e for e in events if e[0] == "chunk"]
    assert [c[1] for c in chunk_events] == ["Güzel ", "cevap! İkinci havuz sorusu."]

    saved_calls = interview_route.save_message.await_args_list
    model_saves = [c for c in saved_calls if c.kwargs.get("role") == "model"]
    assert model_saves[0].kwargs["content"] == "Güzel cevap! İkinci havuz sorusu."


def test_stream_falls_back_to_generation_when_bank_delivery_fails_before_any_chunk(client, monkeypatch):
    """Banka teslimi hiç chunk göndermeden başarısız olursa (full_parts boş),
    client'a hiçbir şey iletilmediği için tam-üretim akışına GÜVENLE düşülebilir."""
    monkeypatch.setattr(interview_route.settings, "MAX_INTERVIEW_QUESTIONS", 3)
    # questions_asked=0 -> pool_index=0 -> havuzdaki TEK adayla eşleşmeli.
    history = _history_with_n_questions_asked(0)
    _mock_interview_service(monkeypatch, history)

    pool = [{"id": "q1", "question_text": "Birinci havuz sorusu.", "similarity": 0.8}]
    monkeypatch.setattr(
        interview_route, "get_interview",
        AsyncMock(return_value={"role": "Backend Developer", "topic": "Python", "status": "ongoing", "question_pool": pool}),
    )

    async def _fake_bank_stream_fails_immediately(*args, **kwargs):
        raise RuntimeError("AI servisi ile iletişim kurulamadı. Tüm modeller meşgul.")
        yield  # pragma: no cover
    monkeypatch.setattr(llm_service, "stream_deliver_bank_question", _fake_bank_stream_fails_immediately)

    async def _fake_generation_stream(*args, **kwargs):
        for part in ["Yedek ", "soru."]:
            yield part
    monkeypatch.setattr(llm_service, "stream_next_question", _fake_generation_stream)

    with client.stream(
        "POST", "/api/v1/interview/chat/stream",
        json={"interview_id": "interview-1", "message": "cevabım"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())

    events = _parse_sse_events(raw)
    chunk_events = [e for e in events if e[0] == "chunk"]
    assert [c[1] for c in chunk_events] == ["Yedek ", "soru."]
    error_events = [e for e in events if e[0] == "error"]
    assert len(error_events) == 0
