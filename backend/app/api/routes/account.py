import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.database import aw
from app.api.dependencies.auth import fetch_user_profile, get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.services import account_service, organization_service

router = APIRouter()


class DeleteAccountRequest(BaseModel):
    # Yanlışlıkla silmeye karşı: kullanıcı kendi e-postasını yazarak onaylar.
    confirm_email: str = Field(max_length=320)


class ConsentUpdate(BaseModel):
    granted: bool


@router.get("/consents/{consent_type}")
async def get_consent(
    consent_type: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Onam durumu ve onam metni (ör. video_analysis)."""
    if consent_type not in account_service.CONSENTS:
        raise HTTPException(status_code=404, detail="Bilinmeyen onam türü")
    return (await aw(account_service.consent_status(current_user.id, consent_type)))


@router.put("/consents/{consent_type}")
async def update_consent(
    consent_type: str,
    payload: ConsentUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Onam verir ya da geri çeker. Video onamı geri çekilirse video analizi sonuçları silinir."""
    if consent_type not in account_service.CONSENTS:
        raise HTTPException(status_code=404, detail="Bilinmeyen onam türü")
    status = (await aw(account_service.set_consent(current_user.id, consent_type, payload.granted)))
    await organization_service.log_audit(current_user.id, None, f"consent.{consent_type}", "user", current_user.id,
                                         {"granted": payload.granted})
    return status


@router.get("/export")
async def export_my_data(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """KVKK md. 11: hakkımda işlenen tüm verileri JSON olarak indir."""
    profile = await fetch_user_profile(current_user.id)  # token'da created_at yok
    data = (await aw(account_service.export_user_data(
        current_user.id, current_user.email,
        {"created_at": profile.created_at, "profile": profile.user_metadata},
    )))
    await organization_service.log_audit(current_user.id, None, "account.export", "user", current_user.id)
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2, default=str).encode("utf-8"),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="deepinsight-verilerim.json"'},
    )


@router.delete("")
async def delete_my_account(
    payload: DeleteAccountRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Hesabı ve tüm kişisel veriyi kalıcı olarak siler (geri alınamaz)."""
    if payload.confirm_email.strip().lower() != (current_user.email or "").strip().lower():
        raise HTTPException(status_code=422, detail="Onay için hesabınızın e-posta adresini doğru yazın.")
    try:
        counts = await account_service.delete_account(current_user.id, current_user.email)
    except account_service.LastAdminError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "deleted", "deleted": counts}
