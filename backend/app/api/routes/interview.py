from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
from app.services.llm_service import llm_service
from app.services.interview_service import (
    create_interview,
    save_message,
    get_interview_history,
    finish_interview_and_evaluate,
    get_interview,
    get_user_interviews
)
from fastapi import Depends
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.api.schemas.interview import InterviewSummary, InterviewDetail

router = APIRouter()

# --- Request / Response Models ---

class StartInterviewRequest(BaseModel):
    role: str
    topic: str

class StartInterviewResponse(BaseModel):
    interview_id: str
    first_message: str

class ChatRequest(BaseModel):
    """Frontend'den gelen istek gövdesi."""
    interview_id: str
    message: str

class ChatResponse(BaseModel):
    """Frontend'e dönen cevap gövdesi."""
    response: str
    interview_complete: bool = False
    evaluation: Optional[Dict[str, Any]] = None

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
        # DB'de mülakat oluştur
        interview_data = await create_interview(
            user_id=current_user.id,
            role=request.role,
            topic=request.topic,
            token=token
        )
        interview_id = str(interview_data["id"])

        # AI'dan ilk selamlama ve soruyu al (başlatma mesajı ile)
        # Mesaj geçmişi henüz yok.
        ai_response = await llm_service.get_chat_response(
            message="Mülakatı başlat.", 
            history=[], 
            role=request.role, 
            topic=request.topic
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
    ve Gemini'den bir cevap döndürür. Eğer mülakat bittiyse değerlendirmeyi kaydeder.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Mesaj boş olamaz.")

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
        
        # Son mesaj hariç öncekileri geçmiş olarak ayarla, son mesajı get_chat_response'a parametre olarak geçmek daha iyi
        history_dicts = [{"role": item["role"], "content": item["content"]} for item in history_records[:-1]]
        last_message = history_records[-1]["content"] if history_records else request.message

        ai_response_text = await llm_service.get_chat_response(
            message=last_message,
            history=history_dicts,
            role=role,
            topic=topic
        )

        # AI yanıtı bir JSON nesnesi mi kontrol et (Mülakat bitişi JSON olarak ayarlanmıştı)
        interview_complete = False
        evaluation_data = None
        
        try:
            # Model eğer JSON formatında değerlendirme döndürdüyse
            clean_text = ai_response_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            elif clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()
            
            parsed_response = json.loads(clean_text)
            if isinstance(parsed_response, dict) and parsed_response.get("interview_complete"):
                interview_complete = True
                evaluation_data = parsed_response.get("evaluation", {})
                
                # Bu durumda kullanıcıya gösterilecek düzgün bir mesaj oluşturabiliriz 
                # veya sadece değerlendirme JSON'u olarak döneriz.
                # Şimdilik düz bir metne dönüştürelim
                feedback = evaluation_data.get("feedback", "Mülakat tamamlandı.")
                tech_score = evaluation_data.get("technical_score", 0)
                conf_score = evaluation_data.get("confidence_score", 0)
                vocab_score = evaluation_data.get("vocabulary_score", 0)
                
                ai_response_text = f"Mülakat tamamlandı.\nDeğerlendirme Raporunuz:\n- Teknik Bilgi: {tech_score}/100\n- Özgüven: {conf_score}/100\n- Kelime Kullanımı: {vocab_score}/100\n\nGeri Bildirim: {feedback}"
        except json.JSONDecodeError:
            import logging
            logging.getLogger(__name__).debug(
                "AI plain-text yanıtı (JSON değil). interview_id=%s", request.interview_id
            )

        # AI cevabını anlık kaydet
        await save_message(request.interview_id, role="model", content=ai_response_text, token=token)

        # Mülakat tamamlandıysa durumu güncelle ve puanları kaydet
        if interview_complete and evaluation_data:
            await finish_interview_and_evaluate(request.interview_id, evaluation_data, token=token)

        return ChatResponse(
            response=ai_response_text,
            interview_complete=interview_complete,
            evaluation=evaluation_data
        )

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
        mime_type = file.content_type or "audio/m4a"
        
        text = await llm_service.transcribe_audio(audio_bytes, mime_type)
        return {"text": text}
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
        for inv in interviews:
            scores = [
                inv.get("technical_score"),
                inv.get("confidence_score"),
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
        
        scores = [
            detail.get("technical_score"),
            detail.get("confidence_score"),
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
