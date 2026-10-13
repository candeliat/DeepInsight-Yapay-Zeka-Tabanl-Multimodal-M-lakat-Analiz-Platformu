"""
LLM dayanıklılığı: model başına devre kesici ve kalıcı kullanım kaydı.
Canlıda gpt-oss-20b her istekte 30 sn zaman aşımına düşüp ancak sonra yedeğe geçiyordu;
devre açılınca sonraki istekler doğrudan sağlıklı modele gider.
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
from openai import RateLimitError

import app.services.llm_service as llm_module
from app.core.config import settings
from app.services.llm_service import CircuitBreaker, LLMService, LLMUnavailable, current_user_id

FIRST, SECOND = LLMService.FREE_MODELS[0], LLMService.FREE_MODELS[1]


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def _response(text="Soru?", total=30):
    usage = SimpleNamespace(prompt_tokens=20, completion_tokens=10, total_tokens=total)
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason="stop")], usage=usage)


def _rate_limited():
    request = httpx.Request("POST", "https://x/v1/chat/completions")
    return RateLimitError("429", response=httpx.Response(429, request=request), body=None)


def _service(clock=None):
    svc = LLMService()
    svc.client.chat.completions.create = AsyncMock()
    svc._sleep_backoff = AsyncMock(return_value=None)
    svc._breaker = CircuitBreaker(threshold=2, cooldown=120, max_cooldown=900, clock=clock or Clock())
    return svc


def _ask(svc):
    return asyncio.run(svc.get_next_question("cevap", [], "Backend", "Python", 1, 5))


def _models_called(svc):
    return [c.kwargs["model"] for c in svc.client.chat.completions.create.call_args_list]


def test_breaker_moves_a_failing_model_to_the_end_after_two_health_failures():
    svc = _service()
    create = svc.client.chat.completions.create
    create.side_effect = [asyncio.TimeoutError(), _response(), asyncio.TimeoutError(), _response(), _response()]
    _ask(svc)
    _ask(svc)  # ikinci üst üste zaman aşımı: devre açılır
    create.reset_mock()
    create.side_effect = [_response()]
    _ask(svc)
    assert _models_called(svc) == [SECOND]  # çökmüş model 30 sn bekletmeden atlanır


def test_model_is_retried_after_cooldown_and_success_closes_the_breaker():
    clock = Clock()
    svc = _service(clock)
    svc._breaker.failure(FIRST)
    svc._breaker.failure(FIRST)
    assert svc._available_models() == [SECOND, FIRST]
    clock.now += 121
    assert svc._available_models() == [FIRST, SECOND]
    svc.client.chat.completions.create.side_effect = [_response()]
    _ask(svc)
    assert _models_called(svc) == [FIRST] and svc._breaker.allows(FIRST)


def test_cooldown_doubles_on_repeated_trips_and_is_capped():
    clock = Clock()
    breaker = CircuitBreaker(threshold=1, cooldown=120, max_cooldown=300, clock=clock)
    durations = []
    for _ in range(3):
        assert breaker.failure("m")
        durations.append(breaker.reopens_at("m") - clock.now)
        clock.now = breaker.reopens_at("m")
    assert durations == [120, 240, 300]


def test_bad_content_does_not_trip_the_breaker():
    svc = _service()
    svc.client.chat.completions.create.side_effect = [_response(""), _response(), _response(""), _response()]
    _ask(svc)
    _ask(svc)
    assert svc._available_models()[0] == FIRST  # boş yanıt isteğe özgü, model sağlıklı sayılır


def test_when_every_model_is_cooling_down_only_the_soonest_one_is_tried():
    clock = Clock()
    svc = _service(clock)
    for model in (FIRST, SECOND):  # SECOND daha sonra açıldı -> daha geç kapanır
        svc._breaker.failure(model)
        svc._breaker.failure(model)
        clock.now += 5
    svc.client.chat.completions.create.side_effect = [_response()]
    assert _ask(svc) == "Soru?"  # devre kesici isteği tek başına düşürmez
    assert _models_called(svc) == [FIRST]

    svc._breaker.failure(FIRST)
    svc._breaker.failure(FIRST)
    svc.client.chat.completions.create.reset_mock()
    svc.client.chat.completions.create.side_effect = [asyncio.TimeoutError(), _response()]
    try:
        _ask(svc)
    except LLMUnavailable:
        pass
    # Sağlayıcı genel olarak bozukken istek başına tek zaman aşımı (2 x 30 sn değil).
    assert len(_models_called(svc)) == 1


def test_all_models_failing_raises_llm_unavailable_which_is_a_runtime_error():
    svc = _service()
    svc.client.chat.completions.create.side_effect = _rate_limited()
    try:
        _ask(svc)
    except LLMUnavailable as e:
        assert isinstance(e, RuntimeError) and isinstance(e.last_error, RateLimitError)
    else:
        raise AssertionError("LLMUnavailable bekleniyordu")


def test_stream_uses_the_breaker_too():
    svc = _service()
    svc._breaker.failure(FIRST)
    svc._breaker.failure(FIRST)

    async def fake_stream(**kwargs):
        async def gen():
            yield SimpleNamespace(usage=None, choices=[SimpleNamespace(delta=SimpleNamespace(content="Merhaba"))])
        return gen()

    svc.client.chat.completions.create = AsyncMock(side_effect=fake_stream)

    async def consume():
        return [d async for d in svc.stream_next_question("c", [], "Backend", "Python", 1, 5)]

    assert asyncio.run(consume()) == ["Merhaba"]
    assert _models_called(svc) == [SECOND]


def test_every_attempt_is_persisted_with_user_tokens_and_outcome(monkeypatch):
    monkeypatch.setattr(settings, "LLM_USAGE_PERSIST", True)
    db = MagicMock()
    monkeypatch.setattr("app.core.database.supabase", db)
    svc = _service()
    svc.client.chat.completions.create.side_effect = [asyncio.TimeoutError(), _response(total=42)]

    async def call():
        current_user_id.set("user-1")
        await svc.get_next_question("c", [], "Backend", "Python", 1, 5)
        await asyncio.gather(*svc._pending_writes)

    asyncio.run(call())
    rows = [c.args[0] for c in db.table.return_value.insert.call_args_list]
    assert [(r["model"], r["success"], r["error_type"]) for r in rows] == [(FIRST, False, "TimeoutError"), (SECOND, True, None)]
    assert all(r["user_id"] == "user-1" and r["purpose"] == "question" for r in rows)
    assert rows[1]["total_tokens"] == 42 and rows[1]["latency_ms"] >= 0
    db.table.assert_called_with("llm_usage")


def test_persistence_failure_never_breaks_the_request(monkeypatch):
    monkeypatch.setattr(settings, "LLM_USAGE_PERSIST", True)
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.side_effect = RuntimeError("db yok")
    monkeypatch.setattr("app.core.database.supabase", db)
    svc = _service()
    svc.client.chat.completions.create.side_effect = [_response()]

    async def call():
        result = await svc.get_next_question("c", [], "Backend", "Python", 1, 5)
        await asyncio.gather(*svc._pending_writes)
        return result

    assert asyncio.run(call()) == "Soru?"


def test_auth_dependency_records_the_user_for_usage(monkeypatch):
    import app.api.dependencies.auth as auth
    from app.api.schemas.user import UserProfile

    user = UserProfile(id="u-9", email="a@b.c", created_at="", user_metadata={}, app_metadata={})
    monkeypatch.setattr(auth, "_resolve_user", AsyncMock(return_value=user))

    async def call():
        await auth.get_current_user("token")
        return llm_module.current_user_id.get()

    assert asyncio.run(call()) == "u-9"
