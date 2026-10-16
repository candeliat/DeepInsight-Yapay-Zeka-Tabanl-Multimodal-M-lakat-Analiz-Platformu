import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.notification import MarkReadRequest, NotificationList
from app.api.schemas.user import UserProfile
from app.services import notification_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/me", response_model=NotificationList)
async def my_notifications(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Kullanıcının bildirimleri (en yeni önce) ve okunmamış sayısı. Son tarih
    hatırlatmaları burada üretilir; üretim başarısız olsa da liste döner."""
    try:
        await notification_service.sync_due_reminders(current_user.id)
    except Exception:
        logger.exception("[notifications] Son tarih hatırlatmaları üretilemedi (user_id=%s)", current_user.id)
    try:
        return await notification_service.list_for_user(current_user.id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/read")
async def mark_read(
    payload: MarkReadRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return {"updated": await notification_service.mark_read(current_user.id, payload.ids)}
