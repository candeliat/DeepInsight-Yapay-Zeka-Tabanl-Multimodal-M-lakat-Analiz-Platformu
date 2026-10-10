import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.job import JobCreate, JobDetail, JobItem, JobMatch, MatchRequest
from app.api.schemas.user import UserProfile
from app.services import job_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=JobDetail)
async def create_job(
    payload: JobCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """İlan metnini kaydeder ve gereksinimlerini (beceriler, deneyim) çıkarır."""
    try:
        return await job_service.create_job(current_user.id, payload.text, payload.title, payload.company)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError:
        raise HTTPException(status_code=503, detail="İlan şu an analiz edilemedi, lütfen biraz sonra tekrar deneyin.")


@router.get("", response_model=List[JobItem])
async def list_jobs(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await job_service.list_jobs(current_user.id)


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(
    job_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    job = await job_service.get_job(current_user.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="İlan bulunamadı")
    return job


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    if not await job_service.delete_job(current_user.id, job_id):
        raise HTTPException(status_code=404, detail="İlan bulunamadı")
    return {"status": "deleted"}


@router.post("/{job_id}/match", response_model=JobMatch)
async def match_job(
    job_id: str,
    payload: MatchRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """İlanı kullanıcının bir CV'siyle eşleştirir: skor, eksik beceriler ve öğrenme yol haritası."""
    try:
        return await job_service.match_job_with_cv(current_user.id, job_id, payload.cv_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/{job_id}/match", response_model=JobMatch)
async def get_latest_match(
    job_id: str,
    cv_id: str = Query(min_length=1, max_length=64),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        match = await job_service.latest_match(current_user.id, job_id, cv_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not match:
        raise HTTPException(status_code=404, detail="Bu ilan ve CV için henüz eşleştirme yapılmadı")
    return match
