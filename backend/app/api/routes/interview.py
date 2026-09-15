import re
import json
import logging
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from app.core.config import settings
from app.services.llm_service import llm_service
from app.services import question_bank_service
from app.services.interview_service import (
    create_interview,
    save_message,
    get_interview_history,
    finish_interview_and_evaluate,
    get_interview,
    get_user_interviews,
    try_claim_interview_finalization,
    get_completed_confidence_map,
    release_interview_finalization_claim,
)
from fastapi import Depends
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.api.schemas.interview import InterviewSummary, InterviewDetail

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Girdi Doğrulama / Sanitizasyon ---

# Kontrol karakterlerini (null-byte, ESC, vb.) temizler — bunlar prompt'a
# gizlice özel karakter enjekte etmek için kullanılabilir.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# role/topic prompt içinde <role>...</role> / <topic>...</topic> delimiter'larıyla
# sarılıyor (bkz. app/services/prompts/interview_v1.py). Kullanıcı girdisi
# içinde literal "<" veya ">" bırakılırsa, aday "</role><role>SİSTEM: ..." gibi
# bir değer girerek delimiter'ı kırıp sahte bir talimat bloğu açabilir. Bu yüzden
# bu iki alan için açı parantezleri tamamen kaldırılıyor. Aday cevaplarının
# (ChatRequest.message) bu delimiter'a sarılmadığı için (normal chat turn'ü
# olarak gönderilir) buradaki kısıtlamaya tabi TUTULMADIĞINA dikkat edin —
# aksi halde adayın kod içeren teknik cevapları ("if i < 5") bozulurdu.
_ANGLE_BRACKETS_RE = re.compile(r"[<>]")


def _sanitize_text(value: str) -> str:
    """Kontrol karakterlerini temizler ve fazla boşlukları sadeleştirir."""
    value = _CONTROL_CHARS_RE.sub("", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _sanitize_label(value: str) -> str:
    """
    `_sanitize_text` + prompt delimiter'ını kıramasın diye açı parantezi temizliği.
    Sadece role/topic gibi delimiter içine sarılan kısa etiket alanları için kullanılır.
    """
    value = _sanitize_text(value)
    value = _ANGLE_BRACKETS_RE.sub("", value)
    return _sanitize_text(value)  # temizlik sonrası oluşabilecek fazla boşluğu tekrar sadeleştir


# --- Request / Response Models ---

_VALID_DIFFICULTIES = {"JUNIOR", "ORTA", "UZMAN"}


class StartInterviewRequest(BaseModel):
    role: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=120)
    # Opsiyonel: eskiden dashboard bunu topic string'ine gizliyordu
    # (bkz. proje notları), artık gerçek bir alan. Soru bankası retrieval'i
    # (question_bank_service.fetch_question_pool) bunu kesin filtre olarak
    # kullanır; None ise zorluk filtresiz eşleşme yapılır.
    difficulty: Optional[str] = None

    @field_validator("role", "topic")
    @classmethod
    def _clean_fields(cls, v: str) -> str:
        v = _sanitize_label(v)
        if not v:
            raise ValueError("Bu alan boş olamaz.")
        return v

    @field_validator("difficulty")
    @classmethod
    def _clean_difficulty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = _sanitize_label(v).upper()
        return v if v in _VALID_DIFFICULTIES else None

class StartInterviewResponse(BaseModel):
    interview_id: str
    first_message: str

class ChatRequest(BaseModel):
    """Frontend'den gelen istek gövdesi."""
    interview_id: str
    message: str = Field(min_length=1, max_length=4000)

    @field_validator("message")
    @classmethod
    def _clean_message(cls, v: str) -> str:
        v = _sanitize_text(v)
        if not v:
            raise ValueError("Mesaj boş olamaz.")
        return v

class ChatResponse(BaseModel):
    """Frontend'e dönen cevap gövdesi."""
    response: str
    interview_complete: bool = False
    evaluation: Optional[Dict[str, Any]] = None

# --- Soru bankası (RAG) destekli soru üretimi ---

async def _ask_question(
    role: str,
    topic: str,
    question_number: int,
    max_questions: int,
    message: str,
    history_dicts: List[Dict[str, Any]],
    question_pool: List[Dict[str, Any]],
) -> str:
    """
    Sıradaki mülakat sorusunu üretir. Önce `/start`'ta bir kez çekilmiş soru
    bankası havuzunu (question_pool) sırayla tüketmeyi dener — `question_number`
    zaten 0-indexed sıradaki index'e karşılık gelir (1. soru -> index 0),
    ayrı bir "hangi sorular soruldu" durumu tutmaya gerek yoktur.

    Havuzda bu index için karşılık yoksa (banka bu rol/konu/zorluk için
    boş/yetersizdi) ya da hafif teslim çağrısı (deliver_bank_question) başarısız
    olursa, LLM'in tam-üretim akışına (get_next_question) sessizce düşülür —
    mülakat bu yüzden ASLA kesintiye uğramaz.
    """
    index = question_number - 1
    if 0 <= index < len(question_pool):
        try:
            return await llm_service.deliver_bank_question(
                bank_question_text=question_pool[index]["question_text"],
                message=message,
                history=history_dicts,
                role=role,
                topic=topic,
                question_number=question_number,
                max_questions=max_questions,
            )
        except Exception:
            logger.warning(
                "[interview] deliver_bank_question başarısız (question_number=%d), tam-üretime düşülüyor.",
                question_number, exc_info=True,
            )

    return await llm_service.get_next_question(
        message=message,
        history=history_dicts,
        role=role,
        topic=topic,
        question_number=question_number,
        max_questions=max_questions,
    )


# --- Endpoints ---

@router.post("/start", response_model=StartInterviewResponse)
async def start_interview(
    request: StartInterviewRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Kullanıcının belirlediği rol ve konuya göre yeni bir mülakat oturumu başlatır.
    """
    try:
        max_questions = settings.MAX_INTERVIEW_QUESTIONS

        # Mülakat başlamadan ÖNCE, soru bankasından role+topic(+difficulty) için
        # TEK SEFERDE en iyi eşleşen `max_questions` adet aday çekilir (best-effort
        # — banka boş/yetersizse veya embedding/RPC başarısız olursa boş liste
        # döner, bkz. question_bank_service.fetch_question_pool). Bu havuz
        # interview kaydına yazılır ve her tur `_ask_question` tarafından
        # sırayla tüketilir.
        question_pool = await question_bank_service.fetch_question_pool(
            role=request.role, topic=request.topic, difficulty=request.difficulty, size=max_questions,
        )

        # DB'de mülakat oluştur
        interview_data = await create_interview(
            user_id=current_user.id,
            role=request.role,
            topic=request.topic,
            token=token,
            difficulty=request.difficulty,
            question_pool=question_pool,
        )
        interview_id = str(interview_data["id"])

        # AI'dan ilk selamlama ve soruyu al (başlatma mesajı ile)
        # Mesaj geçmişi henüz yok.
        ai_response = await _ask_question(
            role=request.role,
            topic=request.topic,
            question_number=1,
            max_questions=max_questions,
            message="Mülakatı başlat.",
            history_dicts=[],
            question_pool=question_pool,
        )

        # Kullanıcının ilk mülakatı başlatma isteğini anlık olarak kaydet 
        # (Böylece AI her seferinde mesaj geçmişine bakarken mülakatın başı olmadığını anlar)
        await save_message(interview_id, role="user", content="Mülakatı başlat.", token=token)

        # İlk mesajı anlık kaydet
        await save_message(interview_id, role="model", content=ai_response, token=token)

        return StartInterviewResponse(
            interview_id=interview_id,
            first_message=ai_response
        )

    except HTTPException:
        raise
    except RuntimeError as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Kullanıcının son mesajını alıp anında DB'ye kaydeder, geçmişi DB'den okur
    ve LLM servisinden bir cevap döndürür. Eğer mülakat bittiyse değerlendirmeyi kaydeder.

    Not: Mesajın boş/whitespace-only olmadığı zaten `ChatRequest` şeması
    (Field min_length=1 + sanitize eden field_validator) tarafından istek
    ayrıştırılırken garanti edilir — bu fonksiyon çalıştığında `request.message`
    her zaman dolu ve temizlenmiştir.
    """
    try:
        # Mülakat bilgilerini al (role, topic)
        try:
            interview = await get_interview(request.interview_id, token=token)
        except ValueError:
            raise HTTPException(status_code=404, detail="Interview not found")
        
        role = interview.get("role", "Yazılım Mühendisi")
        topic = interview.get("topic", "Genel")
        
        # Eğer mülakat zaten tamamlanmışsa hata dön
        if interview.get("status") == "completed":
            raise HTTPException(status_code=400, detail="Bu mülakat zaten tamamlanmış.")

        # Kullanıcı mesajını anlık kaydet
        await save_message(request.interview_id, role="user", content=request.message, token=token)

        # Geçmişi veritabanından çek (en son eklediğimiz kullanıcı mesajı dahil olmak üzere)
        history_records = await get_interview_history(request.interview_id, token=token)

        # Mülakatın bitip bitmediğine modelin kendi kararına GÜVENMİYORUZ — kaç soru
        # sorulduğunu (kaç 'model' mesajı kaydedildiğini) sunucu tarafında sayıyoruz.
        max_questions = settings.MAX_INTERVIEW_QUESTIONS
        questions_asked = sum(1 for m in history_records if m.get("role") == "model")

        interview_complete = False
        evaluation_data = None

        if questions_asked >= max_questions:
            # Son soru da cevaplandı — modele yeni bir soru sordurmak yerine
            # doğrudan nihai değerlendirmeyi zorluyoruz.
            #
            # Pahalı LLM değerlendirme çağrısına girmeden ÖNCE, bu isteğin
            # mülakatı atomik olarak "claim" edip etmediğini kontrol ediyoruz —
            # aksi halde aynı anda gelen iki final istek (çift tıklama, ağ
            # retry'ı) iki kez LLM'e sorup iki kez model mesajı kaydedebilirdi.
            claimed = await try_claim_interview_finalization(request.interview_id, token=token)
            if not claimed:
                raise HTTPException(
                    status_code=409,
                    detail="Bu mülakat şu anda başka bir istek tarafından sonlandırılıyor. Lütfen bekleyin.",
                )

            try:
                evaluation_data = await llm_service.get_final_evaluation(
                    history=[{"role": m["role"], "content": m["content"]} for m in history_records],
                    role=role,
                    topic=topic,
                )
            except Exception:
                # Claim alındı ama değerlendirme başarısız oldu — mülakatı
                # 'ongoing'e geri al ki kullanıcı tekrar deneyebilsin.
                await release_interview_finalization_claim(request.interview_id, token=token)
                raise

            interview_complete = True

            feedback = evaluation_data.get("feedback", "Mülakat tamamlandı.")
            tech_score = evaluation_data.get("technical_score", 0)
            conf_score = evaluation_data.get("confidence_score", 0)
            vocab_score = evaluation_data.get("vocabulary_score", 0)

            ai_response_text = (
                f"Mülakat tamamlandı.\nDeğerlendirme Raporunuz:\n"
                f"- Teknik Bilgi: {tech_score}/100\n- Özgüven: {conf_score}/100\n"
                f"- Kelime Kullanımı: {vocab_score}/100\n\nGeri Bildirim: {feedback}"
            )
        else:
            # Son mesaj hariç öncekileri geçmiş olarak ayarla, son mesajı ayrı parametre olarak geç
            history_dicts = [{"role": item["role"], "content": item["content"]} for item in history_records[:-1]]
            last_message = history_records[-1]["content"] if history_records else request.message

            ai_response_text = await _ask_question(
                role=role,
                topic=topic,
                question_number=questions_asked + 1,
                max_questions=max_questions,
                message=last_message,
                history_dicts=history_dicts,
                question_pool=interview.get("question_pool") or [],
            )

        # AI cevabını anlık kaydet
        try:
            await save_message(request.interview_id, role="model", content=ai_response_text, token=token)

            # Mülakat tamamlandıysa durumu güncelle ve puanları kaydet
            if interview_complete and evaluation_data:
                await finish_interview_and_evaluate(request.interview_id, evaluation_data, token=token)
        except Exception:
            if interview_complete:
                # Claim alınmıştı ama mesaj/skor kaydı başarısız oldu —
                # 'completed' durumunda skorsuz takılı kalmasın diye geri al.
                await release_interview_finalization_claim(request.interview_id, token=token)
            raise

        return ChatResponse(
            response=ai_response_text,
            interview_complete=interview_complete,
            evaluation=evaluation_data
        )

    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")


def _sse(event: str, data: Any) -> str:
    """Bir SSE (Server-Sent Events) event'ini formatlar. `data`, JSON'a
    çevrilir — böylece içindeki yeni satır/özel karakterler SSE'nin tek
    satırlık `data:` alanını bozmaz; client JSON.parse ile geri çözer."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def chat_with_ai_stream(
    request: ChatRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    `/chat` ile aynı iş mantığı (sunucu taraflı soru sayacı dahil), ama
    LLM'in soru metnini token-token SSE (`text/event-stream`) olarak akıtır.

    Event'ler:
      - `chunk`: üretilen metin parçası (JSON string)
      - `done`:  `{"interview_complete": bool, "evaluation": {...} | null}`
      - `error`: `{"detail": str, "partial_saved": bool}` — akış yarıda
                 kesilirse, o ana kadar client'a gönderilmiş kısmi metin
                 yine de DB'ye kaydedilir (client'ın gördüğüyle tutarlı kalsın diye).

    Ön kontroller (mülakat var mı, tamamlanmış mı, kullanıcı mesajını kaydetme)
    stream BAŞLAMADAN önce, normal HTTPException'lar olarak yapılır — böylece
    404/400 gibi durumlar düzgün HTTP status kodlarıyla döner, akışın
    içine gömülmez.
    """
    try:
        interview = await get_interview(request.interview_id, token=token)
    except ValueError:
        raise HTTPException(status_code=404, detail="Interview not found")

    role = interview.get("role", "Yazılım Mühendisi")
    topic = interview.get("topic", "Genel")

    if interview.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Bu mülakat zaten tamamlanmış.")

    await save_message(request.interview_id, role="user", content=request.message, token=token)
    history_records = await get_interview_history(request.interview_id, token=token)

    max_questions = settings.MAX_INTERVIEW_QUESTIONS
    questions_asked = sum(1 for m in history_records if m.get("role") == "model")

    async def event_generator():
        try:
            if questions_asked >= max_questions:
                claimed = await try_claim_interview_finalization(request.interview_id, token=token)
                if not claimed:
                    yield _sse("error", {
                        "detail": "Bu mülakat şu anda başka bir istek tarafından sonlandırılıyor. Lütfen bekleyin.",
                        "partial_saved": False,
                    })
                    return

                try:
                    evaluation_data = await llm_service.get_final_evaluation(
                        history=[{"role": m["role"], "content": m["content"]} for m in history_records],
                        role=role,
                        topic=topic,
                    )
                    feedback = evaluation_data.get("feedback", "Mülakat tamamlandı.")
                    tech_score = evaluation_data.get("technical_score", 0)
                    conf_score = evaluation_data.get("confidence_score", 0)
                    vocab_score = evaluation_data.get("vocabulary_score", 0)
                    full_text = (
                        f"Mülakat tamamlandı.\nDeğerlendirme Raporunuz:\n"
                        f"- Teknik Bilgi: {tech_score}/100\n- Özgüven: {conf_score}/100\n"
                        f"- Kelime Kullanımı: {vocab_score}/100\n\nGeri Bildirim: {feedback}"
                    )
                    yield _sse("chunk", full_text)

                    await save_message(request.interview_id, role="model", content=full_text, token=token)
                    await finish_interview_and_evaluate(request.interview_id, evaluation_data, token=token)
                except Exception:
                    # Claim alındı ama değerlendirme/kayıt başarısız oldu —
                    # mülakatı 'ongoing'e geri al ki kullanıcı tekrar deneyebilsin.
                    await release_interview_finalization_claim(request.interview_id, token=token)
                    raise

                yield _sse("done", {"interview_complete": True, "evaluation": evaluation_data})
                return

            history_dicts = [{"role": item["role"], "content": item["content"]} for item in history_records[:-1]]
            last_message = history_records[-1]["content"] if history_records else request.message

            # Soru bankası havuzunda bu index için bir aday varsa (bkz. _ask_question
            # ve /start'taki genel not), önce hafif "teslim" akışını dener; havuzda
            # karşılık yoksa ya da hiç chunk gönderilmeden başarısız olursa (full_parts
            # boşsa — yani client'a henüz bir şey iletilmediyse) tam-üretim akışına
            # (stream_next_question) sessizce düşülür.
            question_pool = interview.get("question_pool") or []
            pool_index = questions_asked
            bank_question_text = (
                question_pool[pool_index]["question_text"] if 0 <= pool_index < len(question_pool) else None
            )

            full_parts: list[str] = []
            try:
                if bank_question_text:
                    try:
                        async for delta in llm_service.stream_deliver_bank_question(
                            bank_question_text=bank_question_text,
                            message=last_message,
                            history=history_dicts,
                            role=role,
                            topic=topic,
                            question_number=questions_asked + 1,
                            max_questions=max_questions,
                        ):
                            full_parts.append(delta)
                            yield _sse("chunk", delta)
                    except RuntimeError:
                        if full_parts:
                            raise
                        logger.warning(
                            "[chat/stream] stream_deliver_bank_question başarısız, tam-üretime düşülüyor (question_number=%d).",
                            questions_asked + 1, exc_info=True,
                        )
                        async for delta in llm_service.stream_next_question(
                            message=last_message,
                            history=history_dicts,
                            role=role,
                            topic=topic,
                            question_number=questions_asked + 1,
                            max_questions=max_questions,
                        ):
                            full_parts.append(delta)
                            yield _sse("chunk", delta)
                else:
                    async for delta in llm_service.stream_next_question(
                        message=last_message,
                        history=history_dicts,
                        role=role,
                        topic=topic,
                        question_number=questions_asked + 1,
                        max_questions=max_questions,
                    ):
                        full_parts.append(delta)
                        yield _sse("chunk", delta)
            except RuntimeError as e:
                partial_text = "".join(full_parts)
                if partial_text:
                    await save_message(request.interview_id, role="model", content=partial_text, token=token)
                logger.error("[chat/stream] Akış yarıda kesildi (interview_id=%s): %s", request.interview_id, e)
                yield _sse("error", {"detail": str(e), "partial_saved": bool(partial_text)})
                return

            full_text = "".join(full_parts)
            await save_message(request.interview_id, role="model", content=full_text, token=token)
            yield _sse("done", {"interview_complete": False, "evaluation": None})

        except Exception as e:
            logger.error("[chat/stream] Beklenmeyen hata (interview_id=%s): %s", request.interview_id, e, exc_info=True)
            yield _sse("error", {"detail": f"Bir hata oluştu: {str(e)}", "partial_saved": False})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{interview_id}/finish", response_model=ChatResponse)
async def finish_interview_early(
    interview_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Adayın mülakatı MAX_INTERVIEW_QUESTIONS'a ulaşılmadan erken bitirmek
    istediği durumlar için. Soru sayacına bakmaksızın o ana kadarki
    geçmişle doğrudan nihai değerlendirmeyi zorlar.

    Not: `/chat` ve `/chat/stream`'de mülakatın bitişi artık kesinlikle
    sunucu taraflı soru sayacına bağlı (LLM'e "bitir" mesajı göndermek
    işe yaramaz) — erken sonlandırma için bu ayrı uç nokta gerekir.
    """
    try:
        interview = await get_interview(interview_id, token=token)
    except ValueError:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this interview")

    if interview.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Bu mülakat zaten tamamlanmış.")

    # /chat veya /chat/stream aynı mülakatı tam bu sırada zaten sonlandırıyor
    # olabilir (soru sayacı tam bu anda max'a ulaşmış olabilir) — atomik claim
    # ile bu yarış durumunu da /chat ile aynı şekilde kapatıyoruz.
    claimed = await try_claim_interview_finalization(interview_id, token=token)
    if not claimed:
        raise HTTPException(
            status_code=409,
            detail="Bu mülakat şu anda başka bir istek tarafından sonlandırılıyor. Lütfen bekleyin.",
        )

    role = interview.get("role", "Yazılım Mühendisi")
    topic = interview.get("topic", "Genel")

    try:
        try:
            history_records = await get_interview_history(interview_id, token=token)

            evaluation_data = await llm_service.get_final_evaluation(
                history=[{"role": m["role"], "content": m["content"]} for m in history_records],
                role=role,
                topic=topic,
            )

            feedback = evaluation_data.get("feedback", "Mülakat tamamlandı.")
            tech_score = evaluation_data.get("technical_score", 0)
            conf_score = evaluation_data.get("confidence_score", 0)
            vocab_score = evaluation_data.get("vocabulary_score", 0)
            ai_response_text = (
                f"Mülakat erken sonlandırıldı.\nDeğerlendirme Raporunuz:\n"
                f"- Teknik Bilgi: {tech_score}/100\n- Özgüven: {conf_score}/100\n"
                f"- Kelime Kullanımı: {vocab_score}/100\n\nGeri Bildirim: {feedback}"
            )

            await save_message(interview_id, role="model", content=ai_response_text, token=token)
            await finish_interview_and_evaluate(interview_id, evaluation_data, token=token)
        except Exception:
            # Claim alındı ama değerlendirme/kayıt başarısız oldu — mülakatı
            # 'ongoing'e geri al ki kullanıcı tekrar deneyebilsin.
            await release_interview_finalization_claim(interview_id, token=token)
            raise

        return ChatResponse(
            response=ai_response_text,
            interview_complete=True,
            evaluation=evaluation_data,
        )
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")


@router.get("/history/{user_id}", response_model=List[Dict[str, Any]])
async def get_history(
    user_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Belirli bir kullanıcının tüm mülakat geçmişini döndürür.
    """
    try:
        # Prevent users from accessing other users' history
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this history")
            
        interviews = await get_user_interviews(user_id, token=token)
        return interviews
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")

@router.post("/transcribe")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Kullanıcıdan gelen ses kaydını alır ve LLM servisi üzerinden metne çevirir.
    """
    try:
        audio_bytes = await file.read()

        # Tek bir sözlü cevap için makul bir üst sınır — sınırsız boyutlu
        # dosya kabul edip Whisper'ı gereksiz yere meşgul etmeyi engeller.
        max_audio_bytes = 25 * 1024 * 1024  # 25 MB
        if len(audio_bytes) > max_audio_bytes:
            raise HTTPException(status_code=413, detail="Ses dosyası çok büyük (maksimum 25MB).")
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Boş ses dosyası gönderildi.")

        mime_type = file.content_type or "audio/m4a"

        text = await llm_service.transcribe_audio(audio_bytes, mime_type)
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ses çözümlenirken hata oluştu: {str(e)}")

@router.get("/me", response_model=List[InterviewSummary])
async def get_my_interviews(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Giriş yapmış kullanıcının geçmiş tüm mülakatlarının özetini liste halinde döndür.
    """
    try:
        interviews = await get_user_interviews(current_user.id, token=token)

        # Video/ses analizi tamamlanmış mülakatlar için OBJEKTİF özgüven
        # skorunu tek seferde toplu çekiyoruz (N+1 sorgu yerine) — böylece
        # liste ekranındaki ortalama, detay ekranındaki (chat sonuç ekranı,
        # interviews/[id]) ile aynı kaynağı kullanır ve tutarsız görünmez.
        interview_ids = [inv["id"] for inv in interviews]
        confidence_map = await get_completed_confidence_map(interview_ids, token=token)

        for inv in interviews:
            objective_conf = confidence_map.get(inv["id"])
            inv["objective_confidence_pct"] = objective_conf
            conf_value = objective_conf if objective_conf is not None else inv.get("confidence_score")

            scores = [
                inv.get("technical_score"),
                conf_value,
                inv.get("vocabulary_score")
            ]
            valid_scores = [s for s in scores if s is not None and isinstance(s, (int, float))]
            if valid_scores:
                inv["average_score"] = round(sum(valid_scores) / len(valid_scores), 1)
            else:
                inv["average_score"] = None
        return interviews
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")

@router.get("/{interview_id}", response_model=InterviewDetail)
async def get_interview_detail(
    interview_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Belirli bir mülakatın tüm detaylarını döndür.
    """
    try:
        try:
            interview = await get_interview(interview_id, token=token)
        except ValueError:
            raise HTTPException(status_code=404, detail="Interview not found")
            
        if interview.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this interview")
            
        messages = await get_interview_history(interview_id, token=token)
        
        detail = dict(interview)
        detail["messages"] = messages

        confidence_map = await get_completed_confidence_map([interview_id], token=token)
        objective_conf = confidence_map.get(interview_id)
        detail["objective_confidence_pct"] = objective_conf
        conf_value = objective_conf if objective_conf is not None else detail.get("confidence_score")

        scores = [
            detail.get("technical_score"),
            conf_value,
            detail.get("vocabulary_score")
        ]
        valid_scores = [s for s in scores if s is not None and isinstance(s, (int, float))]
        if valid_scores:
            detail["average_score"] = round(sum(valid_scores) / len(valid_scores), 1)
        else:
            detail["average_score"] = None

        return detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")
