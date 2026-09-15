import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.question_bank_admin import (
    QuestionBankCreate,
    QuestionBankGapItem,
    QuestionBankItem,
    QuestionBankUpdate,
)
from app.api.schemas.user import UserProfile
from app.services import question_bank_admin_service as admin_service

logger = logging.getLogger(__name__)
router = APIRouter()

# NOT: Uygulamada henüz bir rol/admin sistemi yok — bu uç noktalar (diğer
# tüm uç noktalar gibi) yalnızca "giriş yapmış kullanıcı" ile korunuyor,
# ayrı bir yetki katmanı yok. Bu, DeepInsight'ı yöneten küçük bir ekip için
# kabul edilebilir; gerçek çok kullanıcılı bir ortamda burası bir admin
# rolüyle daha sıkı kısıtlanmalıdır.


@router.get("/questions", response_model=List[QuestionBankItem])
async def list_questions(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await admin_service.list_questions()


@router.post("/questions", response_model=QuestionBankItem)
async def create_question(
    payload: QuestionBankCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        return await admin_service.create_question(
            role=payload.role,
            topic=payload.topic,
            difficulty=payload.difficulty,
            question_text=payload.question_text,
            tags=payload.tags,
            family_id=payload.family_id,
            new_family=payload.new_family,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Soru eklenirken hata: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Soru eklenemedi: {e}")


@router.patch("/questions/{question_id}", response_model=QuestionBankItem)
async def update_question(
    question_id: str,
    payload: QuestionBankUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        return await admin_service.update_question(question_id, payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e) or "Soru bulunamadı")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        await admin_service.delete_question(question_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"status": "deleted"}


@router.get("/gaps", response_model=List[QuestionBankGapItem])
async def list_gaps(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await admin_service.list_gaps()
