import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies.auth import oauth2_scheme, require_admin
from app.core.rate_limit import ai_rate_limit
from app.api.schemas.question_bank_admin import (
    GenerateCandidatesRequest,
    QuestionBankCandidateItem,
    QuestionBankCreate,
    QuestionBankGapItem,
    QuestionBankItem,
    QuestionBankUpdate,
)
from app.api.schemas.user import UserProfile
from app.services import question_bank_admin_service as admin_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/questions", response_model=List[QuestionBankItem])
async def list_questions(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    return await admin_service.list_questions()


@router.post("/questions", response_model=QuestionBankItem)
async def create_question(
    payload: QuestionBankCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
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
    current_user: UserProfile = Depends(require_admin),
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
    current_user: UserProfile = Depends(require_admin),
):
    try:
        await admin_service.delete_question(question_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"status": "deleted"}


@router.get("/gaps", response_model=List[QuestionBankGapItem])
async def list_gaps(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    return await admin_service.list_gaps()


@router.post("/candidates/generate", response_model=List[QuestionBankCandidateItem], dependencies=[Depends(ai_rate_limit)])
async def generate_candidates(
    payload: GenerateCandidatesRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """En çok görülen boşluklar için LLM'den birer soru ÖNERİSİ üretir —
    öneriler doğrudan bankaya eklenmez, 'pending' kuyruğa düşer."""
    return await admin_service.generate_candidates_for_gaps(limit=payload.limit)


@router.get("/candidates", response_model=List[QuestionBankCandidateItem])
async def list_candidates(
    status: str = "pending",
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    return await admin_service.list_candidates(status=status)


@router.post("/candidates/{candidate_id}/approve", response_model=QuestionBankItem)
async def approve_candidate(
    candidate_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    try:
        return await admin_service.approve_candidate(candidate_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e) or "Öneri bulunamadı")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/candidates/{candidate_id}/reject")
async def reject_candidate(
    candidate_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    try:
        await admin_service.reject_candidate(candidate_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"status": "rejected"}
