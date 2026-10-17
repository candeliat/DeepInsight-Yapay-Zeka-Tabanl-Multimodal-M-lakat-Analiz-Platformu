import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.dependencies.auth import oauth2_scheme, require_admin
from app.api.schemas.user import UserProfile
from app.services import admin_service, feedback_service

logger = logging.getLogger(__name__)
router = APIRouter()

_MONTH = Query(default=None, pattern=r"^\d{4}-\d{2}$")


@router.get("/overview")
async def admin_overview(
    month: Optional[str] = _MONTH,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Platform geneli sayılar (kullanıcı, kurum, mülakat, CV, ilan)."""
    try:
        return await admin_service.overview(month)
    except Exception:
        logger.exception("[admin] Genel bakış okunamadı")
        raise HTTPException(status_code=503, detail="Genel bakış şu an yüklenemiyor.")


@router.get("/ai-usage")
async def admin_ai_usage(
    month: Optional[str] = _MONTH,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Ay bazında platform geneli yapay zekâ kullanımı: özellik, model ve kurum kırılımı, tahmini maliyet."""
    try:
        return await admin_service.ai_usage(month)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("[admin] Yapay zekâ kullanımı okunamadı")
        raise HTTPException(status_code=503, detail="Kullanım verisi şu an yüklenemiyor.")


class FeedbackUpdate(BaseModel):
    status: Optional[Literal["new", "triaged", "planned", "resolved", "rejected"]] = None
    admin_note: Optional[str] = Field(default=None, max_length=2000)


@router.get("/feedback")
async def admin_feedback(
    kind: Optional[Literal["bug", "feature"]] = Query(default=None),
    status: Optional[Literal["new", "triaged", "planned", "resolved", "rejected"]] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Tüm geri bildirimler: gönderen (ad/e-posta), sayfa, platform, ekran görüntüsü (imzalı URL), durum."""
    try:
        return await feedback_service.list_all(kind, status)
    except Exception:
        logger.exception("[admin] Geri bildirimler okunamadı")
        raise HTTPException(status_code=503, detail="Geri bildirimler şu an yüklenemiyor.")


@router.patch("/feedback/{feedback_id}")
async def admin_update_feedback(
    feedback_id: str,
    payload: FeedbackUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Durum (yeni/inceleniyor/planlandı/çözüldü/reddedildi) ve admin notu; denetim kaydına yazılır."""
    updated = await feedback_service.update(current_user.id, feedback_id, payload.status, payload.admin_note)
    if not updated:
        raise HTTPException(status_code=404, detail="Geri bildirim bulunamadı")
    return {"id": updated["id"], "status": updated["status"], "admin_note": updated.get("admin_note")}


@router.get("/ai-inventory")
async def admin_ai_inventory(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Hangi özellik hangi yapay zekâ modelini/aracını kullanıyor, nerede çalışıyor; LLM zincirinin canlı durumu."""
    return admin_service.ai_inventory()
