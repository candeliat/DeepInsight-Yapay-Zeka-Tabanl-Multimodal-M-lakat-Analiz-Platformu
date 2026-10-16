import os
import re
import json
import time
import asyncio
import logging
import tempfile
from collections import defaultdict
from contextvars import ContextVar
from typing import Any, Callable, Optional

from openai import AsyncOpenAI, RateLimitError, NotFoundError, APIStatusError
from pydantic import BaseModel, field_validator

from app.core.config import settings
from app.services.prompts import (
    PROMPT_VERSION,
    build_question_prompt,
    build_question_delivery_prompt,
    build_question_generation_prompt,
    build_evaluation_prompt,
)

logger = logging.getLogger(__name__)


def _empty_model_stats() -> dict:
    return {
        "attempts": 0,
        "successes": 0,
        "failures": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }


def _extract_json_object(text: str) -> Optional[dict]:
    """
    Modelin döndürdüğü metinden bir JSON nesnesi çıkarmaya çalışır.
    Markdown code-fence'leri temizler; metnin içine gömülü JSON'u regex ile de dener.
    """
    if not text:
        return None

    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Metnin başına/sonuna model açıklama eklemiş olabilir — ilk {...} bloğunu ara.
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None

    return None


def _validate_response_length(text: str, purpose: str) -> None:
    """
    Canlı testte gözlemlendi: `max_tokens` reasoning aşamasında dolduğunda,
    bazı reasoning modelleri (bkz. FREE_MODELS yorumu) iç muhakemesini
    (binlerce karakter, genelde İngilizce, "Okay, let's see..." tarzı) ayrı
    reasoning_content kanalı yerine `content` alanına sızdırıyor — normalde
    boş dönmesi beklenen bir hata durumu, bunun yerine kullanıcıya devasa ve
    anlamsız bir "soru" olarak gösterilebiliyordu.

    Gerçek bir mülakat sorusu/kısa değerlendirme asla settings.LLM_MAX_RESPONSE_CHARS
    kadar uzun olmaz — bu eşik aşılırsa yanıt reddedilir (ValueError fırlatılır),
    çağıran taraftaki fallback döngüsü bunu diğer hatalar gibi ele alıp
    sıradaki modele geçer.
    """
    if len(text) > settings.LLM_MAX_RESPONSE_CHARS:
        raise ValueError(
            f"[{purpose}] Model anormal uzunlukta bir yanıt döndürdü "
            f"(len={len(text)} > {settings.LLM_MAX_RESPONSE_CHARS}) — muhtemelen "
            "'reasoning' (iç muhakeme) metni content alanına sızmış, yanıt reddedildi."
        )


class InterviewEvaluation(BaseModel):
    """
    Mülakat sonu değerlendirme çıktısının doğrulanmış şeması.

    ÖNEMLİ — iki farklı "özgüven" kaynağı: `confidence_score` burada LLM'in
    yalnızca metni okuyarak çıkardığı SÜBJEKTİF bir tahmindir (bkz. rubrik).
    Bunu, `interview_analytics.confidence_pct` alanındaki göz teması/stres/
    konuşma hızından hesaplanan OBJEKTİF video-ses skoruyla karıştırma —
    ikisi farklı sinyallerden üretilir ve mülakat akışında farklı zamanlarda
    (biri chat bitiminde, diğeri video analizi tamamlanınca) hesaplanır.
    Bu iki metriğin tek bir skorda birleştirilmesi veya arayüzde net şekilde
    ayrıştırılması, dashboard/mobile şemasını da etkileyen ayrı bir karar
    gerektirir (bkz. proje yol haritası Faz 2 notu).
    """

    technical_score: int = 0
    confidence_score: int = 0
    vocabulary_score: int = 0
    feedback: str = "Değerlendirme otomatik olarak oluşturulamadı."

    @field_validator("technical_score", "confidence_score", "vocabulary_score", mode="before")
    @classmethod
    def _clamp_score(cls, v: Any) -> int:
        try:
            v = int(v)
        except (TypeError, ValueError):
            return 0
        return max(0, min(100, v))


class LLMUnavailable(RuntimeError):
    """Zincirdeki tüm modeller başarısız oldu."""

    def __init__(self, last_error: Exception | None):
        self.last_error = last_error
        super().__init__(f"AI servisi ile iletişim kurulamadı. Tüm modeller meşgul. Son hata: {last_error}")


# İsteği yapan kullanıcı (auth dependency'si ayarlar); kullanım kaydına yazılır.
current_user_id: ContextVar[Optional[str]] = ContextVar("llm_current_user_id", default=None)


class CircuitBreaker:
    """Model başına basit devre kesici.

    Üst üste `threshold` sağlık hatasından (zaman aşımı, 429, 5xx, 404) sonra model
    `cooldown` saniye boyunca zincirin sonuna alınır; tekrar açılırsa süre ikiye katlanır
    (en çok `max_cooldown`). Önceden gpt-oss-20b gibi takılan bir model HER istekte
    30 sn zaman aşımı bekletip ancak sonra yedeğe geçiyordu.
    """

    def __init__(self, threshold: int, cooldown: float, max_cooldown: float, clock: Callable[[], float] = time.monotonic):
        self.threshold, self.base_cooldown, self.max_cooldown, self.clock = threshold, cooldown, max_cooldown, clock
        self._failures: dict[str, int] = defaultdict(int)
        self._open_until: dict[str, float] = {}
        self._cooldown: dict[str, float] = {}

    def allows(self, model: str) -> bool:
        return self.clock() >= self._open_until.get(model, 0.0)

    def reopens_at(self, model: str) -> float:
        return self._open_until.get(model, 0.0)

    def cooldown_of(self, model: str) -> float:
        return self._cooldown.get(model, self.base_cooldown)

    def failure(self, model: str) -> bool:
        """Hatayı sayar; devre bu hatayla açıldıysa True döner."""
        self._failures[model] += 1
        if self._failures[model] < self.threshold:
            return False
        tripped_before = model in self._cooldown
        cooldown = min(self.max_cooldown, self._cooldown[model] * 2) if tripped_before else self.base_cooldown
        self._cooldown[model] = cooldown
        self._open_until[model] = self.clock() + cooldown
        self._failures[model] = 0
        return True

    def success(self, model: str) -> None:
        self._failures.pop(model, None)
        self._open_until.pop(model, None)
        self._cooldown.pop(model, None)


def _text_parser(label: str) -> Callable[[Any], str]:
    def parse(response) -> str:
        result = response.choices[0].message.content
        if not result or not result.strip():
            finish_reason = getattr(response.choices[0], "finish_reason", None)
            raise ValueError(f"Model boş bir yanıt döndürdü (finish_reason={finish_reason}).")
        result = result.strip()
        _validate_response_length(result, label)
        return result
    return parse


def _json_parser(response) -> dict:
    content = response.choices[0].message.content
    parsed = _extract_json_object(content or "")
    if parsed is None:
        finish_reason = getattr(response.choices[0], "finish_reason", None)
        raise ValueError(f"Model geçerli bir JSON döndürmedi (finish_reason={finish_reason}).")
    return parsed


class LLMService:
    """
    Mülakat sohbetini ve nihai değerlendirmeyi OpenAI-uyumlu bir LLM sağlayıcısı
    üzerinden yöneten servis (base_url + FREE_MODELS/PAID_FALLBACK_MODELS
    değiştirilerek OpenRouter, NVIDIA build.nvidia.com gibi farklı sağlayıcılara
    uyarlanabilir — bkz. settings.LLM_BASE_URL).

    - Gerçek async HTTP client kullanır (event loop'u bloklamaz).
    - FREE_MODELS listesini sırayla dener; yalnızca ENABLE_PAID_MODEL_FALLBACK=true
      olduğunda PAID_FALLBACK_MODELS'e (daha büyük/maliyetli modeller) düşer.
    - Geçici hatalarda (429/5xx) üstel geri çekilme (backoff) uygular.
    """

    # NVIDIA build.nvidia.com API kataloğunda GERÇEK canlı istekle doğrulanmış
    # modeller (GET /v1/models listesindeki birçok model bu anahtarla 404
    # veriyor ya da 60sn+ timeout'a giriyor — sadece fiilen çalışanlar burada).
    # Her ikisi de "reasoning" modeli: önce ayrı bir reasoning kanalında
    # düşünüp sonra content üretiyorlar — max_tokens düşük olursa content
    # boş/null dönebilir (bkz. get_next_question/get_final_evaluation'daki
    # yüksek max_tokens değerleri ve finish_reason="length" logu).
    FREE_MODELS = [
        "openai/gpt-oss-20b",
        "nvidia/nemotron-3-super-120b-a12b",
    ]
    # Bu anahtarla denenen diğer modellerin büyük kısmı erişilemez olduğu için
    # şu an doğrulanmış ekstra bir model yok. Yeni bir model doğrulandığında
    # buraya eklenip ENABLE_PAID_MODEL_FALLBACK=true ile etkinleştirilebilir.
    PAID_FALLBACK_MODELS = []

    def __init__(self):
        self.client = AsyncOpenAI(
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY or "DUMMY_KEY_IF_EMPTY",
            timeout=settings.LLM_REQUEST_TIMEOUT,
            max_retries=0,  # retry/fallback mantığını kendimiz yönetiyoruz
        )
        # Process-içi, kalıcı olmayan kullanım metrikleri: hangi model ne kadar
        # denendi/başarılı oldu/başarısız oldu ve ne kadar token harcandı.
        # Kalıcı/tarihsel bir dashboard gerekiyorsa bunun bir DB tablosuna
        # yazılması ayrı bir görevdir (bkz. yol haritası Faz 4).
        self._usage_stats: dict[str, dict] = defaultdict(_empty_model_stats)
        self._breaker = CircuitBreaker(
            threshold=settings.LLM_BREAKER_THRESHOLD,
            cooldown=settings.LLM_BREAKER_COOLDOWN,
            max_cooldown=settings.LLM_BREAKER_MAX_COOLDOWN,
        )
        self._pending_writes: set[asyncio.Task] = set()
        logger.info("[LLMService] Başlatıldı. prompt_version=%s", PROMPT_VERSION)

    def _fallback_models(self) -> list[str]:
        models = list(self.FREE_MODELS)
        if settings.ENABLE_PAID_MODEL_FALLBACK:
            models += self.PAID_FALLBACK_MODELS
        return models

    def get_usage_stats(self) -> dict:
        """Model başına deneme/başarı/hata sayısı ve token tüketimini döner."""
        return {model: dict(stats) for model, stats in self._usage_stats.items()}

    def _record_attempt(self, model_name: str) -> None:
        self._usage_stats[model_name]["attempts"] += 1

    def _record_failure(self, model_name: str) -> None:
        self._usage_stats[model_name]["failures"] += 1

    def _record_success(self, model_name: str, usage: Any, purpose: str) -> None:
        stats = self._usage_stats[model_name]
        stats["successes"] += 1

        prompt_tokens = getattr(usage, "prompt_tokens", None) or 0
        completion_tokens = getattr(usage, "completion_tokens", None) or 0
        total_tokens = getattr(usage, "total_tokens", None) or (prompt_tokens + completion_tokens)

        stats["prompt_tokens"] += prompt_tokens
        stats["completion_tokens"] += completion_tokens
        stats["total_tokens"] += total_tokens

        logger.info(
            "[LLMService] usage purpose=%s model=%s prompt_version=%s prompt_tokens=%d completion_tokens=%d "
            "total_tokens=%d (model_toplam=%d)",
            purpose, model_name, PROMPT_VERSION, prompt_tokens, completion_tokens, total_tokens, stats["total_tokens"],
        )

    @staticmethod
    async def _sleep_backoff(attempt: int, base: float = 0.5, cap: float = 4.0) -> None:
        delay = min(cap, base * (2 ** attempt))
        await asyncio.sleep(delay)

    @staticmethod
    def _history_to_messages(history: list[dict] | None) -> list[dict]:
        messages = []
        for turn in history or []:
            turn_role = "assistant" if turn.get("role") == "model" else "user"
            messages.append({"role": turn_role, "content": turn.get("content", "")})
        return messages

    # ------------------------------------------------------------------
    # Ortak model zinciri: devre kesici + yedek modele geçiş + kullanım kaydı
    # ------------------------------------------------------------------

    def _available_models(self) -> list[str]:
        """Denenecek modeller: devresi kapalı olanlar asıl sırasıyla önce, açık (soğumakta)
        olanlar en son ve en erken açılacak olan önde. Hepsinin devresi açıksa sağlayıcı
        genel olarak bozuktur: yalnızca en erken açılacak model denenir (her model için
        LLM_ATTEMPT_MAX_DURATION beklemek yerine tek deneme). İstek asla yalnızca devre
        kesici yüzünden düşmez."""
        models = self._fallback_models()
        healthy = [m for m in models if self._breaker.allows(m)]
        cooling = sorted((m for m in models if m not in healthy), key=self._breaker.reopens_at)
        return healthy + cooling if healthy else cooling[:1]

    def _on_failure(self, model_name: str, purpose: str, error: Exception, started: float) -> bool:
        """Hatayı kaydeder; modelin sağlığını gösteren hatalarda devreyi besler.
        Geri çekilme (backoff) gerekiyorsa True döner."""
        self._record_failure(model_name)
        status = getattr(error, "status_code", None)
        transient = isinstance(error, (asyncio.TimeoutError, TimeoutError, RateLimitError)) or bool(status and status >= 500)
        # 404 (model kaldırılmış) da modelin kullanılamadığını gösterir; boş/bozuk içerik ise
        # isteğe özgüdür, modeli devreden çıkarmaz.
        if transient or isinstance(error, NotFoundError):
            if self._breaker.failure(model_name):
                logger.warning(
                    "[LLMService] '%s' üst üste başarısız; %.0f sn boyunca sona alınıyor (devre açık).",
                    model_name, self._breaker.cooldown_of(model_name),
                )
        self._persist_usage(purpose, model_name, None, started, error)
        logger.warning(
            "[LLMService] (%s) '%s' başarısız: %s: %s. Sıradaki deneniyor...",
            purpose, model_name, type(error).__name__, str(error)[:120],
        )
        return transient

    async def _complete(
        self,
        *,
        purpose: str,
        messages: list[dict],
        temperature: float,
        max_tokens: int,
        parse: Callable[[Any], Any],
        json_mode: bool = False,
    ) -> Any:
        """Akışsız tüm çağrıların ortak motoru: modelleri sırayla dener, her denemeyi
        LLM_ATTEMPT_MAX_DURATION ile sınırlar, `parse` yanıtı doğrular (boş/bozuk yanıt =
        başarısız deneme). Hepsi başarısızsa LLMUnavailable fırlatır."""
        last_error: Exception | None = None
        for i, model_name in enumerate(self._available_models()):
            self._record_attempt(model_name)
            started = time.monotonic()
            try:
                kwargs: dict[str, Any] = {
                    "model": model_name, "messages": messages,
                    "temperature": temperature, "max_tokens": max_tokens,
                }
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(**kwargs), timeout=settings.LLM_ATTEMPT_MAX_DURATION,
                )
                value = parse(response)
                usage = getattr(response, "usage", None)
                self._record_success(model_name, usage, purpose=purpose)
                self._breaker.success(model_name)
                self._persist_usage(purpose, model_name, usage, started, None)
                return value
            except Exception as e:
                last_error = e
                if self._on_failure(model_name, purpose, e, started):
                    await self._sleep_backoff(i)
        logger.error("[LLMService] (%s) Tüm modeller başarısız oldu. Son hata: %s", purpose, last_error)
        raise LLMUnavailable(last_error)

    def _persist_usage(self, purpose: str, model_name: str, usage: Any, started: float, error: Optional[Exception]) -> None:
        """Her denemeyi llm_usage tablosuna yazar (kurum maliyet raporu, kota ve hata
        analizi için). İsteği asla bekletmez ya da düşürmez: arka planda, hata yutulur."""
        if not settings.LLM_USAGE_PERSIST:
            return
        from app.core.database import run, supabase

        if not supabase:
            return
        record = {
            "user_id": current_user_id.get(),
            "purpose": purpose,
            "model": model_name,
            "success": error is None,
            "error_type": type(error).__name__ if error else None,
            "latency_ms": int((time.monotonic() - started) * 1000),
            "prompt_tokens": getattr(usage, "prompt_tokens", None) or 0,
            "completion_tokens": getattr(usage, "completion_tokens", None) or 0,
            "total_tokens": getattr(usage, "total_tokens", None) or 0,
            "prompt_version": PROMPT_VERSION,
        }

        async def _write() -> None:
            try:
                await run(supabase.table("llm_usage").insert(record))
            except Exception as e:
                logger.debug("[LLMService] Kullanım kaydı yazılamadı: %s", e)

        try:
            task = asyncio.get_running_loop().create_task(_write())
        except RuntimeError:
            return  # olay döngüsü yok (senkron betik): kayıt atlanır
        self._pending_writes.add(task)
        task.add_done_callback(self._pending_writes.discard)

    async def embed_text(self, text: str, input_type: str = "query") -> list[float]:
        """
        Verilen metnin embedding vektörünü döner (soru bankası RAG retrieval'i
        için, bkz. question_bank_service.py). `input_type`: "query" (arama
        sorgusu) veya "passage" (bankaya kaydedilen soru metni) — NVIDIA NIM
        embedding modelleri asimetriktir, ikisi farklı encode edilir.

        FREE_MODELS'teki chat modellerinin aksine burada bir fallback ZİNCİRİ
        YOKTUR — tek bir canlı doğrulanmış embedding modeli kullanılır (bkz.
        settings.QUESTION_BANK_EMBEDDING_MODEL, check_embedding_live.py ile
        doğrulanmıştır). Hata durumunda exception fırlatılır; çağıran taraf
        (question_bank_service) bunu "banka bu tur için kullanılamıyor" olarak
        yorumlayıp LLM'in tam-üretim akışına sessizce düşer — mülakat asla
        embedding hatası yüzünden kesintiye uğramaz.
        """
        response = await self.client.embeddings.create(
            model=settings.QUESTION_BANK_EMBEDDING_MODEL,
            input=[text],
            extra_body={"input_type": input_type},
        )
        return response.data[0].embedding

    async def deliver_bank_question(
        self,
        bank_question_text: str,
        message: str,
        history: list[dict] | None,
        role: str,
        topic: str,
        question_number: int,
        max_questions: int | None = None,
        candidate_context: str | None = None,
        language: str = "tr",
    ) -> str:
        """
        `get_next_question`'ın HAFİF sürümü: soruyu sıfırdan üretmek yerine,
        soru bankasından retrieval ile seçilmiş HAZIR bir soruyu (bkz.
        question_bank_service.py) doğal bir geçişle adaya iletir. Aynı
        model/fallback zincirini kullanır ama çok daha düşük max_tokens ile —
        modelin işi "yaz" değil "kısaca yorumla + ilet" olduğu için.

        `message`: adayın bir önceki cevabı (get_next_question'daki gibi
        `history`'nin SONUNA ayrıca eklenir) — model bu cevaba TEK CÜMLEYLE
        kısaca değinebilsin diye.
        """
        max_questions = max_questions or settings.MAX_INTERVIEW_QUESTIONS

        system_prompt = build_question_delivery_prompt(
            role, topic, question_number, max_questions, bank_question_text, candidate_context, language,
        )
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        if message:
            messages.append({"role": "user", "content": message})

        return await self._complete(
            purpose="question_from_bank", messages=messages, temperature=0.7,
            # Reasoning aşaması burada da (light görev olmasına rağmen) önemli miktarda
            # token harcayabiliyor — bkz. _validate_response_length.
            max_tokens=1536, parse=_text_parser("soru-bankası"),
        )

    async def generate_question_candidate(self, role: str, topic: str, difficulty: Optional[str]) -> str:
        """
        Soru bankası boşluklarını (bkz. question_bank_gaps) doldurmak için
        YENİ bir soru ÖNERİSİ üretir. Bu metodun ürettiği soru ASLA doğrudan
        `question_bank`'a eklenmez — `question_bank_admin_service` tarafından
        `question_bank_candidates`'e 'pending' olarak yazılır ve bir insan
        onaylamadan (Soru Bankası ekranından) mülakatlarda kullanılmaz (bkz.
        proje notları: hibrit LLM üretimi + insan onayı büyüme döngüsü).
        """
        system_prompt = build_question_generation_prompt(role, topic, difficulty)
        messages = [{"role": "system", "content": system_prompt}]

        return await self._complete(
            purpose="question_candidate", messages=messages,
            temperature=0.8,  # daha yüksek — bankaya çeşitlilik katması için
            max_tokens=1024, parse=_text_parser("soru-önerisi"),
        )

    async def get_next_question(
        self,
        message: str,
        history: list[dict] | None,
        role: str,
        topic: str,
        question_number: int,
        max_questions: int | None = None,
        candidate_context: str | None = None,
        language: str = "tr",
    ) -> str:
        """
        Sohbetin bir sonraki mülakat sorusunu (düz metin) üretir.
        Mülakatın bitip bitmediğine ASLA burada karar verilmez — bu, çağıran route
        tarafında sunucu taraflı soru sayacıyla belirlenir (bkz. interview.py).
        """
        max_questions = max_questions or settings.MAX_INTERVIEW_QUESTIONS

        system_prompt = build_question_prompt(role, topic, question_number, max_questions, candidate_context, language)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        if message:
            messages.append({"role": "user", "content": message})

        return await self._complete(
            purpose="question", messages=messages, temperature=0.7,
            # NOT: FREE_MODELS'teki modeller "reasoning" modelleri — content'ten önce ayrı bir
            # reasoning kanalı tüketiyorlar. Düşük max_tokens'ta content boş/null dönebilir, bu
            # yüzden yüksek tutuluyor. Ayrıca bkz. _validate_response_length.
            max_tokens=2048, parse=_text_parser("soru"),
        )

    async def stream_next_question(
        self,
        message: str,
        history: list[dict] | None,
        role: str,
        topic: str,
        question_number: int,
        max_questions: int | None = None,
        candidate_context: str | None = None,
        language: str = "tr",
    ):
        """
        `get_next_question` ile aynı işi yapar ama metni token-token (async
        generator) üretir — SSE ile canlı akış için. Bkz. `_stream_chat` için
        fallback/hata davranışı notu.

        Yields:
            str: Model tarafından üretilen art arda metin parçaları.
        """
        max_questions = max_questions or settings.MAX_INTERVIEW_QUESTIONS
        system_prompt = build_question_prompt(role, topic, question_number, max_questions, candidate_context, language)
        async for delta in self._stream_chat(system_prompt, history, message, max_tokens=1024, purpose="question_stream"):
            yield delta

    async def stream_deliver_bank_question(
        self,
        bank_question_text: str,
        message: str,
        history: list[dict] | None,
        role: str,
        topic: str,
        question_number: int,
        max_questions: int | None = None,
        candidate_context: str | None = None,
        language: str = "tr",
    ):
        """
        `deliver_bank_question`'ın token-token akan sürümü — bkz. `_stream_chat`
        için fallback/hata davranışı notu.

        Yields:
            str: Model tarafından üretilen art arda metin parçaları.
        """
        max_questions = max_questions or settings.MAX_INTERVIEW_QUESTIONS
        system_prompt = build_question_delivery_prompt(
            role, topic, question_number, max_questions, bank_question_text, candidate_context, language,
        )
        async for delta in self._stream_chat(system_prompt, history, message, max_tokens=256, purpose="question_from_bank_stream"):
            yield delta

    async def _stream_chat(
        self,
        system_prompt: str,
        history: list[dict] | None,
        message: str,
        max_tokens: int,
        purpose: str,
    ):
        """
        `stream_next_question` ve `stream_deliver_bank_question`'ın ortak
        motoru: verilen sistem promptu + geçmiş + son mesajla token-token akış
        üretir, fallback zincirini dener.

        Fallback davranışı non-streaming metodlardan FARKLIDIR: bir modelin ilk
        parçası (chunk) client'a gönderilmeden önce hata alınırsa güvenle
        sıradaki modele geçilir. Ama bir model akışın ORTASINDA çökerse, zaten
        client'a gönderilmiş kısmi metni geri almak mümkün olmadığından
        sessizce başka modele geçilmez — akış bir hata mesajıyla sonlandırılır
        ve exception fırlatılır (çağıran taraf bunu SSE'de bir hata event'i
        olarak iletebilir).

        Yields:
            str: Model tarafından üretilen art arda metin parçaları.
        """
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        if message:
            messages.append({"role": "user", "content": message})

        last_error: Exception | None = None
        for i, model_name in enumerate(self._available_models()):
            self._record_attempt(model_name)
            started = False
            usage_info = None
            attempt_start = time.monotonic()
            accumulated_len = 0
            try:
                logger.info("[LLMService] (%s) Model deneniyor: %s", purpose, model_name)
                stream = await self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=max_tokens,
                    stream=True,
                    stream_options={"include_usage": True},
                )
                try:
                    async for chunk in stream:
                        # LLM_REQUEST_TIMEOUT (httpx idle timeout) reasoning modeli
                        # sürekli reasoning_content parçası gönderdiği sürece ASLA
                        # tetiklenmez — bu yüzden ayrı bir TOPLAM süre sınırı gerekir
                        # (bkz. settings.LLM_ATTEMPT_MAX_DURATION).
                        if time.monotonic() - attempt_start > settings.LLM_ATTEMPT_MAX_DURATION:
                            raise TimeoutError(
                                f"Model {settings.LLM_ATTEMPT_MAX_DURATION:.0f} saniye içinde tamamlanamadı."
                            )
                        if getattr(chunk, "usage", None):
                            usage_info = chunk.usage
                        if not chunk.choices:
                            continue
                        delta = chunk.choices[0].delta.content
                        if delta:
                            # bkz. _validate_response_length — burada da aynı reasoning-sızıntısı
                            # riski var. Eşik aşılacaksa client'a YEDİRMEDEN (henüz yield
                            # etmeden) reddet ki mümkünse sessizce başka modele geçilebilsin.
                            if accumulated_len + len(delta) > settings.LLM_MAX_RESPONSE_CHARS:
                                raise ValueError(
                                    f"[{purpose}] Model anormal uzunlukta içerik üretti "
                                    f"(len={accumulated_len + len(delta)} > {settings.LLM_MAX_RESPONSE_CHARS}) — "
                                    "muhtemelen 'reasoning' metni content alanına sızmış."
                                )
                            accumulated_len += len(delta)
                            started = True
                            yield delta
                finally:
                    # Alttaki HTTP bağlantısını garanti altına al — sadece iterasyonun
                    # doğal olarak bitmesine güvenmek (özellikle erken kesilen
                    # tüketimlerde) bağlantı sızıntısına yol açabiliyordu.
                    close = getattr(stream, "aclose", None) or getattr(stream, "close", None)
                    if close:
                        result = close()
                        if asyncio.iscoroutine(result):
                            await result

                if not started:
                    raise ValueError("Model akıştan hiç içerik döndürmedi.")
                self._record_success(model_name, usage_info, purpose=purpose)
                self._breaker.success(model_name)
                self._persist_usage(purpose, model_name, usage_info, attempt_start, None)
                logger.info("[LLMService] Stream başarılı model: %s", model_name)
                return

            except Exception as e:
                last_error = e
                backoff = self._on_failure(model_name, purpose, e, attempt_start)
                if started:
                    # Client'a zaten kısmi metin gönderildi — sessizce başka modele
                    # geçmek yarım+yeni metni birbirine karıştırır. Akışı durdur.
                    logger.error(
                        "[LLMService] '%s' akış ORTASINDA çöktü, kısmi metin zaten gönderildi: %s",
                        model_name, str(e)[:200], exc_info=True,
                    )
                    raise RuntimeError(f"Yanıt üretimi yarıda kesildi: {e}") from e

                if backoff:
                    await self._sleep_backoff(i)
                continue

        logger.error("[LLMService] Tüm modeller (stream) başarısız oldu. Son hata: %s", last_error)
        raise LLMUnavailable(last_error)

    async def get_final_evaluation(
        self,
        history: list[dict] | None,
        role: str,
        topic: str,
        reference: list[dict] | None = None,
        language: str = "tr",
    ) -> dict:
        """
        Mülakat sonu değerlendirmesini üretir. `reference`: soru bankasından sorulan
        soruların "iyi cevap noktaları" ([{question, points}]); puanlama ölçütü olarak
        prompta eklenir (bkz. prompts.interview_v1._reference_block). Modelin geçerli JSON döndürmemesi,
        tüm modellerin başarısız olması gibi durumlarda bile HER ZAMAN geçerli bir
        değerlendirme sözlüğü döner — böylece mülakat asla "tamamlanamayan" bir
        durumda takılı kalmaz.
        """
        system_prompt = build_evaluation_prompt(role, topic, reference, language)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        messages.append({
            "role": "user",
            "content": "Mülakat sona erdi. Şimdi yalnızca JSON formatında nihai değerlendirmeni ver.",
        })

        def parse(response) -> dict:
            content = response.choices[0].message.content
            parsed = _extract_json_object(content or "")
            if parsed is None:
                finish_reason = getattr(response.choices[0], "finish_reason", None)
                raise ValueError(
                    f"Model geçerli bir JSON döndürmedi (finish_reason={finish_reason}, "
                    f"content_len={len(content or '')})."
                )
            return InterviewEvaluation.model_validate(parsed).model_dump()

        try:
            return await self._complete(
                purpose="evaluation", messages=messages, temperature=0.3,
                # NOT: reasoning modelleri uzun rubrikli promptlarda reasoning'e çok token
                # harcayabiliyor; content için yeterli pay bırakmak adına yüksek tutuluyor.
                max_tokens=2048, parse=parse, json_mode=True,
            )
        except LLMUnavailable as e:
            logger.error(
                "[LLMService] Nihai değerlendirme için tüm modeller başarısız oldu. Son hata: %s. "
                "Güvenli varsayılan değerlendirme döndürülüyor.", e.last_error,
            )
            return InterviewEvaluation().model_dump()

    async def generate_json(
        self,
        system_prompt: str,
        user_content: str,
        purpose: str,
        max_tokens: int = 3000,
        temperature: float = 0.2,
    ) -> dict:
        """
        Genel amaçlı yapılandırılmış çıktı: aynı model zinciri / zaman aşımı /
        geri çekilme mantığıyla bir JSON nesnesi döner (bkz. get_final_evaluation).
        `get_final_evaluation`'ın aksine güvenli bir varsayılan UYDURMAZ: tüm
        modeller başarısız olursa RuntimeError fırlatır, çağıran taraf karar verir.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        return await self._complete(
            purpose=purpose, messages=messages, temperature=temperature,
            max_tokens=max_tokens, parse=_json_parser, json_mode=True,
        )

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/m4a", language: str = "tr") -> str:
        """
        Transcribes an audio file into text using the shared local Whisper model
        (100% Free & Unlimited). `analytics.py` ile aynı singleton paylaşılır —
        her çağrıda modeli diskten yeniden yüklemez, ve ağır CPU işini event
        loop'u bloklamadan bir thread'e devreder.
        """
        try:
            from app.services.whisper_service import get_whisper_model

            ext = ".m4a" if "m4a" in mime_type else ".wav"
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            with os.fdopen(fd, 'wb') as f:
                f.write(audio_bytes)

            try:
                model = await asyncio.to_thread(get_whisper_model)
                result = await asyncio.to_thread(
                    model.transcribe,
                    temp_path,
                    language="en" if language == "en" else "tr",
                    initial_prompt=(
                        "Please transcribe this English job interview answer accurately."
                        if language == "en" else
                        "Lütfen bu ses kaydını eksiksiz ve hatasız bir şekilde Türkçe metne çevir."
                    ),
                )
                return result.get("text", "").strip()
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        except Exception as e:
            logger.error("[LLMService] Yerel ses çözümleme hatası: %s", e, exc_info=True)
            raise RuntimeError(f"Ses çözümlenemedi: {str(e)}")


# Singleton
llm_service = LLMService()
