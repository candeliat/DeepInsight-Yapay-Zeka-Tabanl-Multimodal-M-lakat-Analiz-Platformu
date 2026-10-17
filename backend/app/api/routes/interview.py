import re
import json
import logging
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Literal
from app.core.config import settings
from app.services.llm_service import LLMUnavailable, bind_usage_context, llm_service
from app.services import question_bank_service, organization_service, cv_service, cv_analysis_service, job_service, skill_matching, assignment_service, star_service, practice_service
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
    delete_ongoing_interview,
)
from fastapi import Depends
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.core.rate_limit import ai_rate_limit
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
    # Opsiyonel: mülakat bir kurum bağlamında yapılıyorsa (kurumun soru
    # bankası + aylık kotası devreye girer). Kullanıcı o kurumun üyesi olmalı.
    org_id: Optional[str] = Field(default=None, max_length=64)
    # Opsiyonel: kullanıcının kendi CV'si. Verilirse CV profili soru seçimini ve
    # soru üretimini kişiselleştirir (CV önceden analiz edilmiş olmalı).
    cv_id: Optional[str] = Field(default=None, max_length=64)
    # Opsiyonel: kullanıcının kaydettiği bir iş ilanı ("bu ilana göre mülakat").
    # Soru seçimi ilanın zorunlu becerilerine yönelir; CV de verilmişse adayda
    # eksik görünen beceriler nazikçe yoklanır.
    job_id: Optional[str] = Field(default=None, max_length=64)
    # Opsiyonel: kurum ödevi. Verilirse rol/konu/zorluk ve kurum bağlamı ödevden
    # alınır (istemcinin gönderdiği değerler yok sayılır).
    assignment_id: Optional[str] = Field(default=None, max_length=64)
    # Konuşma dili: "en" ile sorular İngilizce sorulur (bankadaki Türkçe soru çevrilir),
    # ses İngilizce çözümlenir; değerlendirme metni yine Türkçedir.
    language: Literal["tr", "en"] = "tr"
    # Opsiyonel: pratik setindeki sorular ("bu setle mülakat yap"); verilirse soru havuzu
    # bunlardan, verilen sırayla kurulur (erişilemeyen kimlikler düşer, boşsa normal seçim).
    question_ids: Optional[List[str]] = Field(default=None, max_length=10)

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
    candidate_context: Optional[str] = None,
    language: str = "tr",
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
                candidate_context=candidate_context,
                language=language,
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
        candidate_context=candidate_context,
        language=language,
    )


def _build_interview_context(cv: Optional[Dict[str, Any]], job: Optional[Dict[str, Any]]) -> Optional[str]:
    """CV profili ve/veya hedef ilandan kısa, kimlik bilgisi içermeyen bir bağlam üretir."""
    profile = (cv or {}).get("profile")
    parts = []
    if profile:
        parts.append(cv_analysis_service.build_candidate_context(profile))
    if job:
        missing = None
        if profile:
            missing = skill_matching.compute_match(
                job.get("requirements") or {}, profile, cv.get("extracted_text") or "",
            )["missing_required"]
        parts.append(job_service.build_job_context(job, missing))
    joined = "\n".join(p for p in parts if p)
    return joined or None


async def _candidate_context_for(interview: Dict[str, Any], user_id: str) -> Optional[str]:
    """Mülakata bağlı CV/ilan varsa kişiselleştirme bağlamını üretir. CV ya da ilan
    silindiyse (on delete set null) ya da okunamazsa o kısım atlanır — mülakat kesilmez."""
    cv_id, job_id = interview.get("cv_id"), interview.get("job_id")
    if not cv_id and not job_id:
        return None
    try:
        cv = await cv_service.get_cv(user_id, cv_id) if cv_id else None
        job = await job_service.get_job(user_id, job_id) if job_id else None
        return _build_interview_context(cv, job)
    except Exception:
        logger.warning("[interview] Aday bağlamı okunamadı (cv_id=%s, job_id=%s).", cv_id, job_id, exc_info=True)
        return None


def _evaluation_reference(interview: Dict[str, Any], questions_asked: int) -> List[Dict[str, Any]]:
    """Mülakatta sorulmuş olan banka sorularının "iyi cevap noktaları" (havuz sırayla
    tüketildiği için ilk `questions_asked` kayıt). Değerlendirmede referans olarak kullanılır."""
    pool = interview.get("question_pool") or []
    return [
        {"question": entry.get("question_text", ""), "points": entry.get("answer_points") or []}
        for entry in pool[:questions_asked]
        if entry.get("answer_points")
    ]


# Değerlendirme yapılamadığında (tüm modeller başarısız) mülakat 0 puanla kapatılmaz;
# 'ongoing'e geri alınır, cevaplar kayıtlı kalır, istemci /finish ile tekrar dener.
EVALUATION_FAILED = (
    "Değerlendirme şu an yapılamadı. Cevaplarınız kaydedildi; birkaç dakika sonra "
    "\"Değerlendirmeyi tekrar dene\" ile yeniden deneyebilirsiniz."
)


async def _owned_interview(interview_id: str, user_id: str) -> Dict[str, Any]:
    """
    Mülakatı getirir ve sahibinin istek yapan kullanıcı olduğunu doğrular.
    Başkasının mülakatı "yok" gibi davranır (404) — varlığı sızdırılmaz.
    Veritabanı erişimi service_role ile olduğu için bu kontrol tek güvence katmanıdır.
    """
    try:
        interview = await get_interview(interview_id)
        bind_usage_context(interview)
    except ValueError:
        raise HTTPException(status_code=404, detail="Interview not found")
    if str(interview.get("user_id")) != str(user_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


# --- Endpoints ---

@router.post("/start", response_model=StartInterviewResponse, dependencies=[Depends(ai_rate_limit)])
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

        if request.assignment_id:
            assignment = await assignment_service.get_assignment_for_member(current_user.id, request.assignment_id)
            if not assignment:
                raise HTTPException(status_code=404, detail="Ödev bulunamadı")
            request.role, request.topic = assignment["role"], assignment["topic"]
            request.difficulty = assignment.get("difficulty")
            request.org_id = assignment["org_id"]

        if request.org_id:
            if not await organization_service.get_membership(request.org_id, current_user.id):
                raise HTTPException(status_code=403, detail="Bu kurumun üyesi değilsiniz.")
            try:
                await organization_service.check_interview_quota(request.org_id)
            except organization_service.QuotaExceededError as e:
                raise HTTPException(status_code=429, detail=str(e))

        cv = None
        job = None
        if request.cv_id:
            cv = await cv_service.get_cv(current_user.id, request.cv_id)
            if not cv:
                raise HTTPException(status_code=404, detail="CV bulunamadı")
            if not cv.get("profile"):
                raise HTTPException(status_code=422, detail="Bu CV henüz analiz edilmemiş. Önce CV analizini çalıştırın.")
        if request.job_id:
            job = await job_service.get_job(current_user.id, request.job_id)
            if not job:
                raise HTTPException(status_code=404, detail="İlan bulunamadı")

        candidate_context = _build_interview_context(cv, job)
        # İlan varsa soru havuzu ilanın zorunlu becerilerine, yoksa CV becerilerine yönelir.
        skills_hint = (
            ((job.get("requirements") or {}).get("required_skills") if job else None)
            or ((cv or {}).get("profile") or {}).get("skills")
            or None
        )

        # Mülakat başlamadan ÖNCE, soru bankasından role+topic(+difficulty) için
        # TEK SEFERDE en iyi eşleşen `max_questions` adet aday çekilir (best-effort
        # — banka boş/yetersizse veya embedding/RPC başarısız olursa boş liste
        # döner, bkz. question_bank_service.fetch_question_pool). Bu havuz
        # interview kaydına yazılır ve her tur `_ask_question` tarafından
        # sırayla tüketilir.
        question_pool = []
        if request.question_ids and not request.assignment_id:
            question_pool = await practice_service.fetch_pool_by_ids(request.question_ids[:max_questions], request.org_id)
        if not question_pool:
            question_pool = await question_bank_service.fetch_question_pool(
                role=request.role, topic=request.topic, difficulty=request.difficulty, size=max_questions,
                org_id=request.org_id,
                skills_hint=skills_hint,
            )

        # DB'de mülakat oluştur
        interview_data = await create_interview(
            user_id=current_user.id,
            role=request.role,
            topic=request.topic,
            token=token,
            difficulty=request.difficulty,
            question_pool=question_pool,
            org_id=request.org_id,
            cv_id=request.cv_id,
            job_id=request.job_id,
            assignment_id=request.assignment_id,
            language=request.language,
        )
        interview_id = str(interview_data["id"])
        bind_usage_context({"id": interview_id, "org_id": request.org_id})

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
            candidate_context=candidate_context,
            language=request.language,
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


def _sse(event: str, data: Any) -> str:
    """Bir SSE (Server-Sent Events) event'ini formatlar. `data`, JSON'a
    çevrilir — böylece içindeki yeni satır/özel karakterler SSE'nin tek
    satırlık `data:` alanını bozmaz; client JSON.parse ile geri çözer."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat/stream", dependencies=[Depends(ai_rate_limit)])
async def chat_with_ai_stream(
    request: ChatRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Adayın cevabını kaydeder ve sıradaki soruyu (sunucu taraflı soru sayacıyla)
    token-token SSE (`text/event-stream`) olarak akıtır; son soru cevaplanınca değerlendirir.

    Event'ler:
      - `star`:  (yalnızca davranışsal mülakatta, ilk olay) adayın cevabının STAR analizi
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
    interview = await _owned_interview(request.interview_id, current_user.id)

    role = interview.get("role", "Yazılım Mühendisi")
    topic = interview.get("topic", "Genel")
    language = interview.get("language") or "tr"

    if interview.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Bu mülakat zaten tamamlanmış.")

    # Davranışsal mülakatta cevap anında STAR açısından değerlendirilir (kural tabanlı, LLM'siz)
    # ve mesajla birlikte saklanır; istemciye yeni sorudan önce `star` olayıyla gider.
    star = star_service.analyze_answer(request.message, language) if star_service.is_behavioral(topic) else None
    await save_message(request.interview_id, role="user", content=request.message, token=token, coaching=star)
    history_records = await get_interview_history(request.interview_id, token=token)

    max_questions = settings.MAX_INTERVIEW_QUESTIONS
    questions_asked = sum(1 for m in history_records if m.get("role") == "model")
    candidate_context = await _candidate_context_for(interview, current_user.id)

    async def event_generator():
        if star:
            yield _sse("star", star)
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
                        reference=_evaluation_reference(interview, questions_asked),
                        language=language,
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
                except LLMUnavailable:
                    await release_interview_finalization_claim(request.interview_id, token=token)
                    yield _sse("error", {"detail": EVALUATION_FAILED, "partial_saved": False, "evaluation_failed": True})
                    return
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
                            candidate_context=candidate_context,
                            language=language,
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
                            candidate_context=candidate_context,
                            language=language,
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
                        candidate_context=candidate_context,
                        language=language,
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


@router.post("/{interview_id}/finish", response_model=ChatResponse, dependencies=[Depends(ai_rate_limit)])
async def finish_interview_early(
    interview_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Adayın mülakatı MAX_INTERVIEW_QUESTIONS'a ulaşılmadan erken bitirmek
    istediği durumlar için. Soru sayacına bakmaksızın o ana kadarki
    geçmişle doğrudan nihai değerlendirmeyi zorlar.

    Not: `/chat/stream`'de mülakatın bitişi kesinlikle
    sunucu taraflı soru sayacına bağlı (LLM'e "bitir" mesajı göndermek
    işe yaramaz) — erken sonlandırma için bu ayrı uç nokta gerekir.
    """
    interview = await _owned_interview(interview_id, current_user.id)

    if interview.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Bu mülakat zaten tamamlanmış.")

    # /chat/stream aynı mülakatı tam bu sırada zaten sonlandırıyor
    # olabilir (soru sayacı tam bu anda max'a ulaşmış olabilir) — atomik claim
    # ile bu yarış durumunu da /chat/stream ile aynı şekilde kapatıyoruz.
    claimed = await try_claim_interview_finalization(interview_id, token=token)
    if not claimed:
        raise HTTPException(
            status_code=409,
            detail="Bu mülakat şu anda başka bir istek tarafından sonlandırılıyor. Lütfen bekleyin.",
        )

    role = interview.get("role", "Yazılım Mühendisi")
    topic = interview.get("topic", "Genel")
    language = interview.get("language") or "tr"

    try:
        try:
            history_records = await get_interview_history(interview_id, token=token)

            evaluation_data = await llm_service.get_final_evaluation(
                history=[{"role": m["role"], "content": m["content"]} for m in history_records],
                role=role,
                topic=topic,
                reference=_evaluation_reference(
                    interview, sum(1 for m in history_records if m.get("role") == "model"),
                ),
                language=language,
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
    except LLMUnavailable:
        raise HTTPException(status_code=503, detail=EVALUATION_FAILED)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")


@router.delete("/{interview_id}")
async def abandon_interview(
    interview_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Yarıda kalmış (tamamlanmamış) kendi mülakatını siler. Tamamlanmış mülakatlar
    gelişim geçmişinin parçasıdır; onlar yalnızca hesap silme ile silinir.
    """
    interview = await _owned_interview(interview_id, current_user.id)
    if interview.get("status") == "completed":
        raise HTTPException(status_code=409, detail="Tamamlanmış mülakatlar silinemez.")
    await delete_ongoing_interview(interview_id)
    return {"status": "deleted"}


@router.post("/transcribe", dependencies=[Depends(ai_rate_limit)])
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    # Mülakatın dili (istemci bilir); yalnızca "en" İngilizce çözümler.
    language: str = Form("tr"),
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

        text = await llm_service.transcribe_audio(audio_bytes, mime_type, "en" if language == "en" else "tr")
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
            if inv.get("status") != "completed":
                # Devam eden mülakatın skor kolonları henüz 0/boş: ortalaması "0/100"
                # gibi görünmemeli — istemciler None'u "devam ediyor" olarak gösterir.
                inv["average_score"] = None
                continue
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
        interview = await _owned_interview(interview_id, current_user.id)

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
        if valid_scores and detail.get("status") == "completed":
            detail["average_score"] = round(sum(valid_scores) / len(valid_scores), 1)
        else:
            detail["average_score"] = None  # devam eden mülakat henüz puanlanmadı

        return detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bir hata oluştu: {str(e)}")
