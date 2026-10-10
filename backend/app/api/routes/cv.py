import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.cv import ConsentStatus, CVDetail, CVItem
from app.api.schemas.user import UserProfile
from app.services import cv_service, cv_text_service, organization_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/consent", response_model=ConsentStatus)
async def get_consent(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return ConsentStatus(
        consent_type=cv_service.CONSENT_TYPE,
        version=cv_service.CONSENT_VERSION,
        text=cv_service.CONSENT_TEXT,
        granted=await cv_service.has_consent(current_user.id),
    )


@router.post("/consent", response_model=ConsentStatus)
async def grant_consent(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    await cv_service.grant_consent(current_user.id)
    return ConsentStatus(
        consent_type=cv_service.CONSENT_TYPE,
        version=cv_service.CONSENT_VERSION,
        text=cv_service.CONSENT_TEXT,
        granted=True,
    )


@router.delete("/consent")
async def revoke_consent(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Rızayı geri çeker; yüklenmiş tüm CV'ler de silinir."""
    return {"status": "revoked", "deleted_cvs": await cv_service.revoke_consent(current_user.id)}


@router.post("", response_model=CVItem)
async def upload_cv(
    file: UploadFile = File(...),
    org_id: Optional[str] = Form(default=None),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    if org_id and not await organization_service.get_membership(org_id, current_user.id):
        raise HTTPException(status_code=403, detail="Bu kurumun üyesi değilsiniz.")

    # Sınırı aşan dosyayı belleğe tamamen almadan reddet.
    data = await file.read(cv_text_service.MAX_CV_BYTES + 1)
    try:
        return await cv_service.create_cv(current_user.id, data, file.filename or "cv", org_id)
    except cv_service.ConsentRequired as e:
        raise HTTPException(status_code=403, detail=str(e))
    except cv_service.CVLimitReached as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:  # desteklenmeyen/okunamayan dosya
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("", response_model=List[CVItem])
async def list_my_cvs(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await cv_service.list_cvs(current_user.id)


@router.get("/{cv_id}", response_model=CVDetail)
async def get_my_cv(
    cv_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    cv = await cv_service.get_cv(current_user.id, cv_id)
    if not cv:
        raise HTTPException(status_code=404, detail="CV bulunamadı")
    return cv


@router.delete("/{cv_id}")
async def delete_my_cv(
    cv_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    if not await cv_service.delete_cv(current_user.id, cv_id):
        raise HTTPException(status_code=404, detail="CV bulunamadı")
    return {"status": "deleted"}
