import os
import json
import logging
import tempfile
from openai import OpenAI, RateLimitError, NotFoundError, APIStatusError
from app.core.config import settings

logger = logging.getLogger(__name__)

def generate_system_instruction(role: str, topic: str) -> str:
    return f"""Sen profesyonel bir İnsan Kaynakları ve {role} pozisyonu için Teknik Mülakat uzmanısın.
Konumuz: {topic}.

KURALLAR:
1. Eğer mülakatın başındaysan (ilk mesaj ise), adaya kısa ve nazik bir karşılama mesajıyla ilk soruyu sor. Geçmiş mesajlar varsa kesinlikle tekrar selamlama yapma, sadece adayın cevabını değerlendir ve bir sonraki soruya geç.
2. Adaya bir seferde sadece BİR soru sor. Asla birden fazla soru aynı anda sorma.
3. Adayın cevabını bekle ve o cevaba göre konuyu derinleştirerek bir sonraki soruyu üret.
4. Mülakatı toplamda maksimum 5 soruyla sınırla.
5. Sorularını Türkçe sor.
6. **TTS UYUMU**: Cevaplarınızı sesli okumaya (Text-to-Speech) uygun, temiz bir formatta verin. Emoji kullanmayın, karmaşık markdown tabloları veya kod blokları (eğer çok zorunlu değilse) kullanmayın. Konuşma diline yakın ve doğal bir dil kullanın.

DEĞERLENDİRME:
5. soruyu sorduktan ve adayın son cevabını aldıktan sonra mülakatı bitir.
Mülakatı bitirirken düz metin rapor yerine SADECE AŞAĞIDAKİ JSON FORMATINDA bir cevap dön. JSON dışında hiçbir metin ekleme.

{{
  "interview_complete": true,
  "evaluation": {{
    "technical_score": 85, 
    "confidence_score": 90,
    "vocabulary_score": 80,
    "feedback": "Adayın teknik bilgisi genel olarak iyi seviyede. Ancak bazı konularda daha derinlemesine bilgi sahibi olması beklenebilir. Özgüveni yüksek ve kendini iyi ifade ediyor."
  }}
}}
"""

class LLMService:
    """
    Service class to handle structured interview interactions with OpenRouter and Local Whisper.
    Birden fazla ücretsiz modeli sırayla dener — biri meşgulse diğerine geçer.
    """

    # OpenRouter'daki ücretsiz modeller (sırayla denenir)
    AVAILABLE_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-1.5-flash:free",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
    "google/gemma-2-9b-it:free"
]
    FREE_MODELS = AVAILABLE_MODELS

    def __init__(self):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY or "DUMMY_KEY_IF_EMPTY",
        )

    async def get_chat_response(
        self,
        message: str,
        history: list[dict] | None = None,
        role: str = "Yazılım Mühendisi",
        topic: str = "Genel"
    ) -> str:
        """
        Sends the user's latest message along with conversation history to the OpenRouter model.
        Eğer bir model rate-limit veya 404 verirse, sıradaki ücretsiz modele otomatik geçer.
        """
        import time

        messages = []
        
        # System instruction
        system_instruction = generate_system_instruction(role, topic)
        messages.append({"role": "system", "content": system_instruction})

        if history:
            for turn in history:
                turn_role = turn.get("role", "user")
                if turn_role == "model":
                    turn_role = "assistant"
                content = turn.get("content", "")
                messages.append({"role": turn_role, "content": content})

        if message:
            messages.append({"role": "user", "content": message})

        last_error = None
        for model_name in self.AVAILABLE_MODELS:
            try:
                logger.info("[LLMService] Model deneniyor: %s", model_name)
                response = self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2048,
                )
                result = response.choices[0].message.content
                if not result:
                    raise ValueError("Model boş bir yanıt döndürdü.")
                logger.info("[LLMService] Başarılı model: %s", model_name)
                return result

            except RateLimitError as e:
                last_error = e
                logger.warning(
                    "[LLMService] Model '%s' kota sınırına takıldı (HTTP 429). Hata: %s. Sıradaki deneniyor...",
                    model_name,
                    str(e)
                )
                time.sleep(1)
                continue
            except NotFoundError as e:
                last_error = e
                logger.warning(
                    "[LLMService] Model '%s' bulunamadı (HTTP 404). Hata: %s. Sıradaki deneniyor...",
                    model_name,
                    str(e)
                )
                time.sleep(1)
                continue
            except APIStatusError as e:
                last_error = e
                logger.warning(
                    "[LLMService] Model '%s' API hatası verdi (HTTP %s). Hata: %s. Sıradaki deneniyor...",
                    model_name,
                    e.status_code,
                    str(e)
                )
                time.sleep(1)
                continue
            except Exception as e:
                last_error = e
                logger.warning(
                    "[LLMService] Model '%s' beklenmeyen hata verdi: %s. Sıradaki deneniyor...",
                    model_name,
                    str(e)[:120]
                )
                time.sleep(1)
                continue

        logger.error("[LLMService] Tüm modeller başarısız oldu. Son hata: %s", last_error, exc_info=True)
        raise RuntimeError(f"AI servisi ile iletişim kurulamadı. Tüm modeller meşgul. Son hata: {str(last_error)}")

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/m4a") -> str:
        """
        Transcribes an audio file into text using Local Whisper model (100% Free & Unlimited).
        """
        try:
            import whisper
            
            # Save audio bytes to a temp file
            ext = ".m4a" if "m4a" in mime_type else ".wav"
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            with os.fdopen(fd, 'wb') as f:
                f.write(audio_bytes)
                
            try:
                # Load the local Whisper model
                model = whisper.load_model(settings.WHISPER_MODEL)
                result = model.transcribe(
                    temp_path, 
                    language="tr",
                    initial_prompt="Lütfen bu ses kaydını eksiksiz ve hatasız bir şekilde Türkçe metne çevir."
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