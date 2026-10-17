import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.core.rate_limit import ai_rate_limit
from app.services import feedback_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", dependencies=[Depends(ai_rate_limit)])
async def send_feedback(
    request: Request,
    kind: Literal["bug", "feature"] = Form(...),
    title: str = Form(min_length=3, max_length=150),
    description: str = Form(min_length=5, max_length=4000),
    page: Optional[str] = Form(default=None, max_length=300),
    platform: Optional[Literal["web", "mobile"]] = Form(default=None),
    screenshot: Optional[UploadFile] = File(default=None),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Hata bildirimi (bug) ya da özellik önerisi (feature); isteğe bağlı ekran görüntüsü (PNG/JPG/WEBP, ≤5 MB)."""
    data = await screenshot.read(feedback_service.MAX_SCREENSHOT_BYTES + 1) if screenshot else None
    try:
        created = await feedback_service.create_feedback(
            current_user.id, kind, title, description, page, platform,
            request.headers.get("user-agent"), data or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("[feedback] Kaydedilemedi (user_id=%s)", current_user.id)
        raise HTTPException(status_code=503, detail="Geri bildirim şu an gönderilemedi. Biraz sonra tekrar deneyin.")
    return {"id": created["id"], "status": created["status"]}


@router.get("/me")
async def my_feedback(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Kullanıcının kendi geri bildirimleri ve durumları."""
    try:
        return await feedback_service.list_mine(current_user.id)
    except Exception:
        logger.exception("[feedback] Liste okunamadı (user_id=%s)", current_user.id)
        raise HTTPException(status_code=503, detail="Geri bildirimler şu an yüklenemiyor.")
