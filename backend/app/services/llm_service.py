import os
import re
import json
import asyncio
import logging
import tempfile
from collections import defaultdict
from typing import Any, Optional

from openai import AsyncOpenAI, RateLimitError, NotFoundError, APIStatusError
from pydantic import BaseModel, field_validator

from app.core.config import settings
from app.services.prompts import PROMPT_VERSION, build_question_prompt, build_evaluation_prompt

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

    async def get_next_question(
        self,
        message: str,
        history: list[dict] | None,
        role: str,
        topic: str,
        question_number: int,
        max_questions: int | None = None,
    ) -> str:
        """
        Sohbetin bir sonraki mülakat sorusunu (düz metin) üretir.
        Mülakatın bitip bitmediğine ASLA burada karar verilmez — bu, çağıran route
        tarafında sunucu taraflı soru sayacıyla belirlenir (bkz. interview.py).
        """
        max_questions = max_questions or settings.MAX_INTERVIEW_QUESTIONS

        system_prompt = build_question_prompt(role, topic, question_number, max_questions)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        if message:
            messages.append({"role": "user", "content": message})

        last_error: Exception | None = None
        for i, model_name in enumerate(self._fallback_models()):
            self._record_attempt(model_name)
            try:
                logger.info("[LLMService] (soru) Model deneniyor: %s", model_name)
                response = await self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    # NOT: FREE_MODELS'teki modeller "reasoning" modelleri — content'ten
                    # önce ayrı bir reasoning kanalı tüketiyorlar. Düşük max_tokens'ta
                    # content boş/null dönebilir, bu yüzden yüksek tutuluyor.
                    max_tokens=1024,
                )
                result = response.choices[0].message.content
                if not result or not result.strip():
                    finish_reason = getattr(response.choices[0], "finish_reason", None)
                    raise ValueError(f"Model boş bir yanıt döndürdü (finish_reason={finish_reason}).")
                self._record_success(model_name, getattr(response, "usage", None), purpose="question")
                logger.info("[LLMService] Başarılı model: %s", model_name)
                return result.strip()

            except RateLimitError as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' kota sınırına takıldı (429). Sıradaki deneniyor...", model_name)
                await self._sleep_backoff(i)
                continue
            except NotFoundError as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' bulunamadı (404). Sıradaki deneniyor...", model_name)
                continue
            except APIStatusError as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' API hatası (HTTP %s). Sıradaki deneniyor...", model_name, e.status_code)
                if e.status_code and e.status_code >= 500:
                    await self._sleep_backoff(i)
                continue
            except Exception as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' beklenmeyen hata: %s. Sıradaki deneniyor...", model_name, str(e)[:120])
                continue

        logger.error("[LLMService] Tüm modeller başarısız oldu. Son hata: %s", last_error, exc_info=True)
        raise RuntimeError(f"AI servisi ile iletişim kurulamadı. Tüm modeller meşgul. Son hata: {last_error}")

    async def stream_next_question(
        self,
        message: str,
        history: list[dict] | None,
        role: str,
        topic: str,
        question_number: int,
        max_questions: int | None = None,
    ):
        """
        `get_next_question` ile aynı işi yapar ama metni token-token (async
        generator) üretir — SSE ile canlı akış için.

        Fallback davranışı get_next_question'dan FARKLIDIR: bir modelin ilk
        parçası (chunk) client'a gönderilmeden önce hata alınırsa güvenle
        sıradaki modele geçilir (tıpkı non-streaming sürümde olduğu gibi).
        Ama bir model akışın ORTASINDA çökerse, zaten client'a gönderilmiş
        kısmi metni geri almak mümkün olmadığından sessizce başka modele
        geçilmez — akış bir hata mesajıyla sonlandırılır ve exception
        fırlatılır (çağıran taraf bunu SSE'de bir hata event'i olarak
        iletebilir).

        Yields:
            str: Model tarafından üretilen art arda metin parçaları.
        """
        max_questions = max_questions or settings.MAX_INTERVIEW_QUESTIONS

        system_prompt = build_question_prompt(role, topic, question_number, max_questions)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        if message:
            messages.append({"role": "user", "content": message})

        last_error: Exception | None = None
        for i, model_name in enumerate(self._fallback_models()):
            self._record_attempt(model_name)
            started = False
            usage_info = None
            try:
                logger.info("[LLMService] (soru-stream) Model deneniyor: %s", model_name)
                stream = await self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1024,
                    stream=True,
                    stream_options={"include_usage": True},
                )
                try:
                    async for chunk in stream:
                        if getattr(chunk, "usage", None):
                            usage_info = chunk.usage
                        if not chunk.choices:
                            continue
                        delta = chunk.choices[0].delta.content
                        if delta:
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
                self._record_success(model_name, usage_info, purpose="question_stream")
                logger.info("[LLMService] Stream başarılı model: %s", model_name)
                return

            except Exception as e:
                last_error = e
                self._record_failure(model_name)
                if started:
                    # Client'a zaten kısmi metin gönderildi — sessizce başka modele
                    # geçmek yarım+yeni metni birbirine karıştırır. Akışı durdur.
                    logger.error(
                        "[LLMService] '%s' akış ORTASINDA çöktü, kısmi metin zaten gönderildi: %s",
                        model_name, str(e)[:200], exc_info=True,
                    )
                    raise RuntimeError(f"Yanıt üretimi yarıda kesildi: {e}") from e

                logger.warning("[LLMService] '%s' stream başlamadan hata verdi: %s. Sıradaki deneniyor...", model_name, str(e)[:150])
                status_code = getattr(e, "status_code", None)
                if isinstance(e, RateLimitError) or (status_code and status_code >= 500):
                    await self._sleep_backoff(i)
                continue

        logger.error("[LLMService] Tüm modeller (stream) başarısız oldu. Son hata: %s", last_error, exc_info=True)
        raise RuntimeError(f"AI servisi ile iletişim kurulamadı. Tüm modeller meşgul. Son hata: {last_error}")

    async def get_final_evaluation(
        self,
        history: list[dict] | None,
        role: str,
        topic: str,
    ) -> dict:
        """
        Mülakat sonu değerlendirmesini üretir. Modelin geçerli JSON döndürmemesi,
        tüm modellerin başarısız olması gibi durumlarda bile HER ZAMAN geçerli bir
        değerlendirme sözlüğü döner — böylece mülakat asla "tamamlanamayan" bir
        durumda takılı kalmaz.
        """
        system_prompt = build_evaluation_prompt(role, topic)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        messages.append({
            "role": "user",
            "content": "Mülakat sona erdi. Şimdi yalnızca JSON formatında nihai değerlendirmeni ver.",
        })

        last_error: Exception | None = None
        for i, model_name in enumerate(self._fallback_models()):
            self._record_attempt(model_name)
            try:
                logger.info("[LLMService] (değerlendirme) Model deneniyor: %s", model_name)
                response = await self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.3,
                    # NOT: reasoning modelleri (bkz. FREE_MODELS yorumu) uzun rubrikli
                    # promptlarda reasoning'e çok token harcayabiliyor; content için
                    # yeterli pay bırakmak adına yüksek tutuluyor.
                    max_tokens=2048,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                parsed = _extract_json_object(content or "")
                if parsed is None:
                    finish_reason = getattr(response.choices[0], "finish_reason", None)
                    raise ValueError(
                        f"Model geçerli bir JSON döndürmedi (finish_reason={finish_reason}, "
                        f"content_len={len(content or '')})."
                    )

                evaluation = InterviewEvaluation.model_validate(parsed)
                self._record_success(model_name, getattr(response, "usage", None), purpose="evaluation")
                logger.info("[LLMService] Değerlendirme başarılı, model: %s", model_name)
                return evaluation.model_dump()

            except RateLimitError as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' kota sınırına takıldı (429). Sıradaki deneniyor...", model_name)
                await self._sleep_backoff(i)
                continue
            except NotFoundError as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' bulunamadı (404). Sıradaki deneniyor...", model_name)
                continue
            except APIStatusError as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning(
                    "[LLMService] '%s' API hatası (HTTP %s) — response_format desteklemiyor olabilir. Sıradaki deneniyor...",
                    model_name, e.status_code,
                )
                if e.status_code and e.status_code >= 500:
                    await self._sleep_backoff(i)
                continue
            except Exception as e:
                last_error = e
                self._record_failure(model_name)
                logger.warning("[LLMService] '%s' beklenmeyen hata: %s. Sıradaki deneniyor...", model_name, str(e)[:120])
                continue

        logger.error(
            "[LLMService] Nihai değerlendirme için tüm modeller başarısız oldu. Son hata: %s. "
            "Güvenli varsayılan değerlendirme döndürülüyor.",
            last_error, exc_info=True,
        )
        return InterviewEvaluation().model_dump()

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/m4a") -> str:
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
                    language="tr",
                    initial_prompt="Lütfen bu ses kaydını eksiksiz ve hatasız bir şekilde Türkçe metne çevir.",
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
