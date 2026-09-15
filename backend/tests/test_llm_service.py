"""
LLMService birim testleri.

Gerçek OpenRouter ağ çağrısı YAPILMAZ — `client.chat.completions.create`
mock'lanır. Amaç: model fallback sırası, backoff, JSON çıkarma/clamping ve
"mülakat asla takılı kalmaz" garantisi gibi Faz 1/2 düzeltmelerinin
davranışını sabitlemek (regression'a karşı kilitlemek).

Çalıştırmak için (backend/ dizininden):
    pip install -r requirements-dev.txt
    pytest tests/test_llm_service.py -v
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APIStatusError, NotFoundError, RateLimitError

import app.services.llm_service as llm_service_module
from app.services.llm_service import LLMService, InterviewEvaluation, _extract_json_object


def run(coro):
    """pytest-asyncio eklentisine ihtiyaç duymadan async test gövdelerini çalıştırır."""
    return asyncio.run(coro)


def run_stream(agen):
    """Bir async generator'ın tüm parçalarını toplayıp birleştirilmiş metni döner."""
    async def _collect():
        parts = []
        async for chunk in agen:
            parts.append(chunk)
        return "".join(parts)
    return asyncio.run(_collect())


class _FakeStream:
    """`await client.chat.completions.create(..., stream=True)`'in döndürdüğü
    async-iterable nesneyi taklit eder."""

    def __init__(self, deltas: list[str], usage: SimpleNamespace | None = None, crash_after: bool = False):
        self._deltas = deltas
        self._usage = usage
        self._crash_after = crash_after

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._deltas:
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=d))], usage=None)
        if self._usage is not None:
            yield SimpleNamespace(choices=[], usage=self._usage)
        if self._crash_after:
            raise RuntimeError("bağlantı yarıda koptu")


class _FakeSlowStream:
    """`_FakeStream` ile aynı ama her chunk'tan önce bir gecikme uygular —
    `settings.LLM_ATTEMPT_MAX_DURATION` (toplam süre sınırı) testleri için."""

    def __init__(self, deltas: list[str], delay_per_chunk: float):
        self._deltas = deltas
        self._delay = delay_per_chunk

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._deltas:
            await asyncio.sleep(self._delay)
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=d))], usage=None)


def _fake_response(content: str, usage: SimpleNamespace | None = None):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=usage,
    )


def _fake_usage(prompt=10, completion=5, total=15):
    return SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion, total_tokens=total)


def _api_error(cls, status_code: int, message: str = "boom"):
    request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    response = httpx.Response(status_code=status_code, request=request)
    return cls(message, response=response, body=None)


def _service_with_mock_client(no_sleep: bool = True) -> LLMService:
    svc = LLMService()
    svc.client.chat.completions.create = AsyncMock()
    if no_sleep:
        # Testler gerçek backoff süresi kadar beklemesin.
        svc._sleep_backoff = AsyncMock(return_value=None)
    return svc


# --------------------------------------------------------------------------
# get_next_question — model fallback / backoff / hata davranışı
# --------------------------------------------------------------------------

def test_get_next_question_success_first_model():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.return_value = _fake_response("Merhaba, ilk sorumuz şu:", _fake_usage())

    result = run(svc.get_next_question("Mülakatı başlat.", [], "Backend Developer", "Python", 1, 5))

    assert result == "Merhaba, ilk sorumuz şu:"
    assert svc.client.chat.completions.create.call_count == 1
    # İlk model başarılı oldu, fallback listesinin ilk elemanı denenmiş olmalı.
    called_model = svc.client.chat.completions.create.call_args.kwargs["model"]
    assert called_model == LLMService.FREE_MODELS[0]


def test_get_next_question_falls_back_on_rate_limit():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = [
        _api_error(RateLimitError, 429),
        _fake_response("İkinci modelden gelen soru.", _fake_usage()),
    ]

    result = run(svc.get_next_question("cevap", [], "QA Engineer", "Test Otomasyonu", 2, 5))

    assert result == "İkinci modelden gelen soru."
    assert svc.client.chat.completions.create.call_count == 2


def test_get_next_question_skips_immediately_on_404_without_backoff():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = [
        _api_error(NotFoundError, 404),
        _fake_response("Sıradaki model cevap verdi.", _fake_usage()),
    ]

    result = run(svc.get_next_question("cevap", [], "Data Scientist", "ML", 1, 5))

    assert result == "Sıradaki model cevap verdi."
    # 404'te backoff YAPILMAMALI (yanlış model adında beklemenin anlamı yok).
    svc._sleep_backoff.assert_not_called()


def test_get_next_question_raises_when_all_models_fail():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = _api_error(RateLimitError, 429)

    with pytest.raises(RuntimeError):
        run(svc.get_next_question("cevap", [], "Backend Developer", "Python", 1, 5))

    assert svc.client.chat.completions.create.call_count == len(LLMService.FREE_MODELS)


def test_get_next_question_empty_response_treated_as_failure_and_falls_back():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = [
        _fake_response("   ", _fake_usage()),  # boş/whitespace yanıt -> başarısız sayılmalı
        _fake_response("Gerçek soru burada.", _fake_usage()),
    ]

    result = run(svc.get_next_question("cevap", [], "Backend Developer", "Python", 1, 5))
    assert result == "Gerçek soru burada."


def test_get_next_question_rejects_reasoning_leak_and_falls_back(monkeypatch):
    """
    Canlı testte gözlemlenen gerçek hata: max_tokens reasoning aşamasında
    dolunca bazı reasoning modelleri iç muhakemesini (binlerce karakter)
    content alanına sızdırıyor. Bu, kullanıcıya devasa/anlamsız bir "soru"
    olarak gösterilmemeli — reddedilip sıradaki modele düşülmeli.
    """
    monkeypatch.setattr(llm_service_module.settings, "LLM_MAX_RESPONSE_CHARS", 50)
    svc = _service_with_mock_client()
    leaked_reasoning = "Okay, let's see. The user just answered the first question. " * 5  # > 50 karakter
    svc.client.chat.completions.create.side_effect = [
        _fake_response(leaked_reasoning, _fake_usage()),
        _fake_response("Kısa gerçek soru.", _fake_usage()),
    ]

    result = run(svc.get_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert result == "Kısa gerçek soru."
    assert svc.client.chat.completions.create.call_count == 2


def test_get_next_question_falls_back_on_attempt_timeout(monkeypatch):
    """
    `LLM_REQUEST_TIMEOUT` (httpx idle timeout) bir model sürekli veri
    gönderdiği sürece tetiklenmez — `LLM_ATTEMPT_MAX_DURATION` bunun yerine
    tek bir model denemesi için TOPLAM bir süre sınırı uygular.
    """
    monkeypatch.setattr(llm_service_module.settings, "LLM_ATTEMPT_MAX_DURATION", 0.05)
    svc = _service_with_mock_client()

    calls = {"n": 0}

    async def _side_effect(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            await asyncio.sleep(0.2)
            return _fake_response("YAVAŞ MODEL ASLA GÖRÜNMEMELİ")
        return _fake_response("Hızlı ikinci model cevabı.", _fake_usage())

    svc.client.chat.completions.create.side_effect = _side_effect

    result = run(svc.get_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert result == "Hızlı ikinci model cevabı."
    assert svc.client.chat.completions.create.call_count == 2


def test_deliver_bank_question_rejects_reasoning_leak_and_falls_back(monkeypatch):
    monkeypatch.setattr(llm_service_module.settings, "LLM_MAX_RESPONSE_CHARS", 50)
    svc = _service_with_mock_client()
    leaked_reasoning = "Okay, let's see. The user just answered the first question. " * 5
    svc.client.chat.completions.create.side_effect = [
        _fake_response(leaked_reasoning, _fake_usage()),
        _fake_response("Kısa banka sorusu teslimi.", _fake_usage()),
    ]

    result = run(svc.deliver_bank_question("Bankadan soru.", "cevap", [], "Rol", "Konu", 2, 5))

    assert result == "Kısa banka sorusu teslimi."
    assert svc.client.chat.completions.create.call_count == 2


def test_paid_models_excluded_by_default(monkeypatch):
    svc = _service_with_mock_client()
    assert set(svc._fallback_models()) == set(LLMService.FREE_MODELS)
    for paid in LLMService.PAID_FALLBACK_MODELS:
        assert paid not in svc._fallback_models()


# --------------------------------------------------------------------------
# get_final_evaluation — JSON sağlamlığı ve "asla takılı kalmama" garantisi
# --------------------------------------------------------------------------

def test_get_final_evaluation_parses_clean_json():
    svc = _service_with_mock_client()
    content = '{"technical_score": 85, "confidence_score": 70, "vocabulary_score": 60, "feedback": "iyi bir performans"}'
    svc.client.chat.completions.create.return_value = _fake_response(content, _fake_usage())

    result = run(svc.get_final_evaluation([], "Backend Developer", "Python"))

    assert result == {
        "technical_score": 85,
        "confidence_score": 70,
        "vocabulary_score": 60,
        "feedback": "iyi bir performans",
    }


def test_get_final_evaluation_parses_json_wrapped_in_markdown_fence():
    svc = _service_with_mock_client()
    content = '```json\n{"technical_score": 200, "confidence_score": -20, "vocabulary_score": 50, "feedback": "ok"}\n```'
    svc.client.chat.completions.create.return_value = _fake_response(content, _fake_usage())

    result = run(svc.get_final_evaluation([], "Backend Developer", "Python"))

    # Aralık dışı skorlar 0-100'e kırpılmalı.
    assert result["technical_score"] == 100
    assert result["confidence_score"] == 0


def test_get_final_evaluation_parses_json_with_surrounding_prose():
    svc = _service_with_mock_client()
    content = (
        'Elbette, işte değerlendirmem: '
        '{"technical_score": 70, "confidence_score": 60, "vocabulary_score": 65, "feedback": "gayet iyi"} '
        'umarım yardımcı olur.'
    )
    svc.client.chat.completions.create.return_value = _fake_response(content, _fake_usage())

    result = run(svc.get_final_evaluation([], "Backend Developer", "Python"))
    assert result["technical_score"] == 70


def test_get_final_evaluation_never_raises_even_if_all_models_return_garbage():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.return_value = _fake_response("bu bir JSON değil, düz metin.")

    # RuntimeError FIRLATMAMALI — mülakat her zaman tamamlanabilmeli.
    result = run(svc.get_final_evaluation([], "Backend Developer", "Python"))

    assert result == InterviewEvaluation().model_dump()
    assert svc.client.chat.completions.create.call_count == len(LLMService.FREE_MODELS)


def test_get_final_evaluation_never_raises_even_if_all_models_error_out():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = _api_error(APIStatusError, 500)

    result = run(svc.get_final_evaluation([], "Backend Developer", "Python"))

    assert result["feedback"] == InterviewEvaluation().feedback


# --------------------------------------------------------------------------
# _extract_json_object — düşük seviyeli ayrıştırma sağlamlığı
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "text,expected_technical",
    [
        ('{"technical_score": 42}', 42),
        ('```json\n{"technical_score": 42}\n```', 42),
        ('Cevap: {"technical_score": 42} son.', 42),
    ],
)
def test_extract_json_object_variants(text, expected_technical):
    parsed = _extract_json_object(text)
    assert parsed is not None
    assert parsed["technical_score"] == expected_technical


def test_extract_json_object_returns_none_for_non_json_text():
    assert _extract_json_object("burada hiç json yok") is None
    assert _extract_json_object("") is None


# --------------------------------------------------------------------------
# InterviewEvaluation — skor kırpma (clamping)
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [(200, 100), (-10, 0), (50, 50), ("70", 70), ("gecersiz", 0), (None, 0)],
)
def test_interview_evaluation_clamps_scores(raw, expected):
    ev = InterviewEvaluation.model_validate({"technical_score": raw})
    assert ev.technical_score == expected


# --------------------------------------------------------------------------
# Kullanım metrikleri (Faz 3, madde 10)
# --------------------------------------------------------------------------

def test_usage_stats_tracks_attempts_successes_and_tokens():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.return_value = _fake_response(
        "cevap", _fake_usage(prompt=100, completion=20, total=120)
    )

    run(svc.get_next_question("m", [], "Rol", "Konu", 1, 5))

    stats = svc.get_usage_stats()
    first_model = LLMService.FREE_MODELS[0]
    assert stats[first_model]["attempts"] == 1
    assert stats[first_model]["successes"] == 1
    assert stats[first_model]["failures"] == 0
    assert stats[first_model]["total_tokens"] == 120


def test_usage_stats_tracks_failures_across_fallback_chain():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = [
        _api_error(RateLimitError, 429),
        _fake_response("ok", _fake_usage()),
    ]

    run(svc.get_next_question("m", [], "Rol", "Konu", 1, 5))

    stats = svc.get_usage_stats()
    assert stats[LLMService.FREE_MODELS[0]]["failures"] == 1
    assert stats[LLMService.FREE_MODELS[1]]["successes"] == 1


# --------------------------------------------------------------------------
# stream_next_question — token-token akış (Faz 4)
# --------------------------------------------------------------------------

def test_stream_next_question_yields_chunks_from_first_model():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.return_value = _FakeStream(
        ["Merhaba", ", ", "nasıl", " gidiyor?"], usage=_fake_usage(total=42)
    )

    text = run_stream(svc.stream_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert text == "Merhaba, nasıl gidiyor?"
    assert svc.client.chat.completions.create.call_count == 1
    stats = svc.get_usage_stats()
    assert stats[LLMService.FREE_MODELS[0]]["successes"] == 1
    assert stats[LLMService.FREE_MODELS[0]]["total_tokens"] == 42


def test_stream_next_question_falls_back_before_any_chunk_sent():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = [
        _api_error(RateLimitError, 429),  # ilk model bağlanırken hata verdi, henüz chunk yok
        _FakeStream(["ikinci ", "modelden ", "cevap"]),
    ]

    text = run_stream(svc.stream_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert text == "ikinci modelden cevap"
    assert svc.client.chat.completions.create.call_count == 2


def test_stream_next_question_raises_and_stops_if_model_crashes_mid_stream():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.return_value = _FakeStream(["parça bir "], crash_after=True)

    async def _collect_and_check():
        received = []
        with pytest.raises(RuntimeError):
            async for chunk in svc.stream_next_question("cevap", [], "Rol", "Konu", 1, 5):
                received.append(chunk)
        return received

    received = asyncio.run(_collect_and_check())

    # İlk parça gerçekten client'a ulaşmış olmalı (stream tüketiliyor).
    assert received == ["parça bir "]
    # Akış ortasında çöktüğü için BAŞKA MODELE GEÇİLMEMELİ (kısmi metin zaten gönderildi).
    assert svc.client.chat.completions.create.call_count == 1


def test_stream_next_question_raises_when_all_models_fail_before_starting():
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = _api_error(RateLimitError, 429)

    with pytest.raises(RuntimeError):
        run_stream(svc.stream_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert svc.client.chat.completions.create.call_count == len(LLMService.FREE_MODELS)


def test_stream_next_question_rejects_reasoning_leak_and_falls_back(monkeypatch):
    """
    Canlı testte gözlemlenen gerçek hata: reasoning modeli, max_tokens
    reasoning aşamasında dolunca TEK BÜYÜK bir chunk'ta (binlerce karakter,
    genelde İngilizce iç muhakeme) sözde "content" döndürüyor. Bu chunk
    client'a hiç YEDİRİLMEDEN reddedilip sıradaki modele düşülmeli.
    """
    monkeypatch.setattr(llm_service_module.settings, "LLM_MAX_RESPONSE_CHARS", 50)
    svc = _service_with_mock_client()
    leaked_reasoning = "Okay, let's see. The user just answered the first question. " * 5
    svc.client.chat.completions.create.side_effect = [
        _FakeStream([leaked_reasoning]),
        _FakeStream(["kısa ", "gerçek ", "soru"]),
    ]

    text = run_stream(svc.stream_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert text == "kısa gerçek soru"
    assert svc.client.chat.completions.create.call_count == 2


def test_stream_next_question_falls_back_on_attempt_timeout(monkeypatch):
    """`LLM_ATTEMPT_MAX_DURATION` aşılırsa (bkz. non-streaming eşdeğeri),
    akış henüz hiçbir chunk göndermediyse güvenle sıradaki modele düşülür."""
    monkeypatch.setattr(llm_service_module.settings, "LLM_ATTEMPT_MAX_DURATION", 0.05)
    svc = _service_with_mock_client()
    svc.client.chat.completions.create.side_effect = [
        _FakeSlowStream(["YAVAŞ MODEL ASLA GÖRÜNMEMELİ"], delay_per_chunk=0.15),
        _FakeStream(["ikinci ", "model ", "cevabı"]),
    ]

    text = run_stream(svc.stream_next_question("cevap", [], "Rol", "Konu", 1, 5))

    assert text == "ikinci model cevabı"
    assert svc.client.chat.completions.create.call_count == 2
