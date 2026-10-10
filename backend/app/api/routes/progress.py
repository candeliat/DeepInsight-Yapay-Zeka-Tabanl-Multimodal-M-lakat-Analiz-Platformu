import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.services import progress_report, progress_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _display_name(user: UserProfile) -> str:
    meta = user.user_metadata or {}
    name = " ".join(p for p in (meta.get("first_name"), meta.get("last_name")) if p)
    return name or user.email


@router.get("/me")
async def my_progress(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Tamamlanmış mülakatlardan zaman serisi, eğilim, konu bazında performans ve öneriler."""
    try:
        return await asyncio.to_thread(progress_service.get_user_progress, current_user.id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/me/report.pdf")
async def my_progress_report(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Gelişim raporunun PDF'i (2 sayfa: özet + eğilim grafiği + öneriler, konu tablosu + geçmiş)."""
    try:
        progress = await asyncio.to_thread(progress_service.get_user_progress, current_user.id)
        pdf = await asyncio.to_thread(progress_report.build_progress_pdf, progress, _display_name(current_user))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="deepinsight-gelisim-raporu.pdf"'},
    )
