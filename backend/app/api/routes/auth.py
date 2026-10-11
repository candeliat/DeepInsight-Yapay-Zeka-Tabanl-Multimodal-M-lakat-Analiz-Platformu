import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from app.api.dependencies.auth import get_current_user
from datetime import datetime, timezone

from app.api.schemas.user import PRIVACY_NOTICE_VERSION, UserCreate, UserLogin, TokenResponse, UserProfile
from app.core.database import supabase

logger = logging.getLogger(__name__)
router = APIRouter()

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshTokenRequest):
    """
    Supabase refresh token kullanarak yeni bir access token döndürür.
    Hem dashboard hem de mobil 401 aldığında bu endpoint'i çağırır.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )
    try:
        from supabase import create_client
        from app.core.config import settings
        temp_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

        response = temp_client.auth.refresh_session(body.refresh_token)

        if not response.session:
            raise HTTPException(status_code=401, detail="Refresh token geçersiz veya süresi dolmuş.")

        return TokenResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            user=response.user.model_dump() if response.user else {}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token yenilenemedi: {str(e)}"
        )


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate):
    """
    Register a new user using Supabase Authentication.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )

    if not user_data.privacy_accepted:
        raise HTTPException(status_code=422, detail="Kayıt için aydınlatma metnini okuduğunuzu onaylamanız gerekir.")

    try:
        # User metadata can store additional profile info
        user_metadata = {
            "privacy_notice_version": PRIVACY_NOTICE_VERSION,
            "privacy_accepted_at": datetime.now(timezone.utc).isoformat(),
        }
        if user_data.first_name:
            user_metadata["first_name"] = user_data.first_name
        if user_data.last_name:
            user_metadata["last_name"] = user_data.last_name
        if user_data.target:
            user_metadata["target"] = user_data.target

        # Create a fresh client so we don't pollute the global supabase client's session
        from supabase import create_client
        from app.core.config import settings
        temp_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        
        response = temp_client.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
            "options": {
                "data": user_metadata
            }
        })
        
        # In a real app, you might want to return a specific profile structure
        return {"message": "User registered successfully", "user": response.user.model_dump() if response.user else None}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin):
    """
    Login endpoint expecting a JSON body (for mobile/web clients).
    Returns a JWT access token.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )

    try:
        from supabase import create_client
        from app.core.config import settings
        temp_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        
        response = temp_client.auth.sign_in_with_password({
            "email": user_data.email,
            "password": user_data.password
        })
        
        return TokenResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            user=response.user.model_dump() if response.user else {}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(e)}"
        )

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    access_token: str = Field(min_length=10, max_length=4096)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    """
    Şifre sıfırlama e-postası gönderir. Hesap var olsun olmasın aynı yanıtı döner
    (hangi e-postaların kayıtlı olduğu bu uç noktadan öğrenilemesin).
    """
    try:
        from supabase import create_client
        from app.core.config import settings
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        client.auth.reset_password_for_email(body.email, {"redirect_to": settings.PASSWORD_RESET_REDIRECT})
    except Exception:
        logger.warning("[auth] Şifre sıfırlama e-postası gönderilemedi.", exc_info=True)
    return {"message": "Bu e-postayla kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    """E-postadaki bağlantının verdiği kurtarma token'ıyla yeni şifre belirler."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database connection is not configured.")
    try:
        user = supabase.auth.get_user(body.access_token).user
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="Bağlantının süresi dolmuş ya da geçersiz. Yeniden sıfırlama isteyin.")
    supabase.auth.admin.update_user_by_id(user.id, {"password": body.new_password})
    return {"message": "Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz."}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user: UserProfile = Depends(get_current_user)):
    """Oturum açıkken şifre değiştirme; mevcut şifre doğrulanır."""
    from supabase import create_client
    from app.core.config import settings
    try:
        create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY).auth.sign_in_with_password(
            {"email": current_user.email, "password": body.current_password}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Mevcut şifreniz hatalı.")
    supabase.auth.admin.update_user_by_id(current_user.id, {"password": body.new_password})
    return {"message": "Şifreniz güncellendi."}


@router.post("/swagger-login", response_model=TokenResponse, include_in_schema=False)
def swagger_login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Login endpoint specifically designed for Swagger UI's OAuth2 auth flow.
    Expects application/x-www-form-urlencoded data instead of JSON.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )

    try:
        from supabase import create_client
        from app.core.config import settings
        temp_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        
        response = temp_client.auth.sign_in_with_password({
            "email": form_data.username,  # OAuth2 uses 'username' field which is mapped to email here
            "password": form_data.password
        })
        
        return TokenResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            user=response.user.model_dump() if response.user else {}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect username or password"
        )
