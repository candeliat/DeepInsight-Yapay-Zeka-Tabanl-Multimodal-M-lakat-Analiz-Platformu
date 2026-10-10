import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from supabase_auth.errors import AuthRetryableError
from app.core.database import supabase
from app.api.schemas.user import UserProfile
from app.services import organization_service

# tokenUrl must point to a route that accepts application/x-www-form-urlencoded
# We will create /api/v1/auth/swagger-login for Swagger UI to fetch the token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/swagger-login")

def get_current_user(token: str = Depends(oauth2_scheme)) -> UserProfile:
    """
    Validate the token from the Authorization header and return the user profile.
    Raises HTTPException if the token is invalid or user is not found.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )

    try:
        # Supabase get_user verifies the JWT token string
        user_response = supabase.auth.get_user(token)
        
        if hasattr(user_response, 'user') and user_response.user:
            user = user_response.user
            return UserProfile(
                id=user.id,
                email=user.email,
                created_at=str(user.created_at),
                user_metadata=user.user_metadata or {},
                app_metadata=user.app_metadata or {}
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    except HTTPException:
        raise
    except (httpx.TransportError, AuthRetryableError, TimeoutError, OSError) as e:
        # Supabase'e ulaşılamadı/zaman aşımı: token geçersiz DEĞİL. 401 dönülürse
        # istemci oturumu kapatır (dashboard'daki api.ts 401'de token'ı siler) —
        # geçici bir ağ yavaşlığı kullanıcıyı sistemden atmamalı.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Kimlik doğrulama servisine şu an ulaşılamıyor, lütfen tekrar deneyin. ({type(e).__name__})",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_org_role(*allowed_roles: str):
    """
    Path'teki `org_id` kurumunda kullanıcının `allowed_roles`'tan birine sahip
    olmasını şart koşan bir dependency üretir. Platform admini destek amaçlı
    her kuruma erişebilir. Üye olmayan kullanıcı, kurumun var olup olmadığını
    sızdırmamak için 404 değil 403 alır.
    """
    async def _dependency(org_id: str, current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
        if current_user.app_metadata.get("role") == "admin":
            return current_user
        membership = await organization_service.get_membership(org_id, current_user.id)
        if not membership or membership["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu kurumda bu işlem için yetkiniz yok."
            )
        return current_user

    return _dependency


def require_admin(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """
    get_current_user'ın üzerine kurulu: kullanıcının app_metadata.role'ü
    'admin' değilse 403 döner. app_metadata yalnızca service_role ile
    (backend tarafından) yazılabildiği için — user_metadata'nın aksine —
    yetkilendirme için güvenilir bir alan.
    """
    if current_user.app_metadata.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yönetici yetkisi gereklidir."
        )
    return current_user
