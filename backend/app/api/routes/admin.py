import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies.auth import oauth2_scheme, require_admin
from app.api.schemas.user import UserProfile
from app.services import admin_service

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


@router.get("/ai-inventory")
async def admin_ai_inventory(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Hangi özellik hangi yapay zekâ modelini/aracını kullanıyor, nerede çalışıyor; LLM zincirinin canlı durumu."""
    return admin_service.ai_inventory()
