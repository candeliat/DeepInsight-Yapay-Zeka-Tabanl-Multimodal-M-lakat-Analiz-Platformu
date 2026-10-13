import logging
import time
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from supabase_auth.errors import AuthRetryableError
from app.core.config import settings
from app.core.database import aw, supabase
from app.api.schemas.user import UserProfile
from app.services import organization_service

logger = logging.getLogger(__name__)

# tokenUrl must point to a route that accepts application/x-www-form-urlencoded
# We will create /api/v1/auth/swagger-login for Swagger UI to fetch the token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/swagger-login")

_TRANSIENT = (httpx.TransportError, AuthRetryableError, TimeoutError, OSError)

# --- Yerel JWT doğrulama -------------------------------------------------------------
# Supabase erişim token'ları asimetrik anahtarla (ES256) imzalanır; açık anahtarlar JWKS
# uç noktasında yayınlanır. Token'ı yerelde doğrulamak her istekte Supabase Auth'a yapılan
# ağ çağrısını (~100-300 ms) kaldırır. Bilinen ödünleşim: çıkış yapılmış (iptal edilmiş)
# bir oturumun token'ı süresi dolana kadar (en çok 1 saat) geçerli sayılır — Supabase'in
# önerdiği yerel doğrulamanın standart davranışı.
_JWKS_TTL = 600          # anahtar listesi 10 dakikada bir yenilenir
_JWKS_MIN_REFRESH = 30   # bilinmeyen kid için en sık yenileme aralığı (anahtar rotasyonu)
_LOCAL_ALGS = {"ES256", "RS256", "EdDSA"}
_jwks: Dict[str, Any] = {"keys": {}, "fetched_at": 0.0}


async def _fetch_jwks() -> None:
    url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    keys = {}
    for jwk in resp.json().get("keys", []):
        try:
            keys[jwk["kid"]] = jwt.PyJWK(jwk).key
        except Exception as e:  # desteklenmeyen anahtar türü: atla
            logger.warning("JWKS anahtarı okunamadı (kid=%s): %s", jwk.get("kid"), e)
    _jwks["keys"], _jwks["fetched_at"] = keys, time.monotonic()


async def _signing_key(kid: str):
    age = time.monotonic() - _jwks["fetched_at"]
    if age > _JWKS_TTL or (kid not in _jwks["keys"] and age > _JWKS_MIN_REFRESH):
        try:
            await _fetch_jwks()
        except Exception as e:
            logger.warning("JWKS alınamadı, Supabase Auth ile doğrulanacak: %s", e)
    return _jwks["keys"].get(kid)


async def _verify_locally(token: str) -> Optional[Dict[str, Any]]:
    """
    Token'ı yerelde doğrular ve claim'leri döner. Yerelde karar verilemiyorsa (JWT biçiminde
    değil, simetrik algoritma, anahtar bulunamadı) None döner ve Supabase Auth'a sorulur.
    İmza/süre/kitle hatası kesin olarak geçersizdir -> 401.
    """
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        return None
    alg, kid = header.get("alg"), header.get("kid")
    if alg not in _LOCAL_ALGS or not kid or not settings.SUPABASE_URL:
        return None
    key = await _signing_key(kid)
    if key is None:
        return None
    try:
        return jwt.decode(
            token, key, algorithms=[alg], audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süresi doldu.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _profile_from_claims(claims: Dict[str, Any]) -> UserProfile:
    # created_at token'da yok; gerekiyorsa fetch_user_profile ile tam kayıt okunur.
    return UserProfile(
        id=claims["sub"],
        email=claims.get("email") or "",
        created_at="",
        user_metadata=claims.get("user_metadata") or {},
        app_metadata=claims.get("app_metadata") or {},
    )


def _profile_from_user(user) -> UserProfile:
    return UserProfile(
        id=user.id,
        email=user.email,
        created_at=str(user.created_at),
        user_metadata=user.user_metadata or {},
        app_metadata=user.app_metadata or {},
    )


async def fetch_user_profile(user_id: str) -> UserProfile:
    """Kullanıcının GÜNCEL tam kaydı (created_at dahil). Token'daki user_metadata token
    üretildiği andaki kopyadır; profil okuma/güncelleme bunu kullanmalı."""
    try:
        resp = await aw(supabase.auth.admin.get_user_by_id(user_id))
    except _TRANSIENT as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Kimlik doğrulama servisine şu an ulaşılamıyor, lütfen tekrar deneyin. ({type(e).__name__})",
        )
    if not getattr(resp, "user", None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kullanıcı bulunamadı.")
    return _profile_from_user(resp.user)


async def _get_user(token: str):
    try:
        return await aw(supabase.auth.get_user(token))
    except _TRANSIENT:
        # Boşta kalan havuz bağlantısını sunucu kapatmış olabilir (ReadError/ConnectionReset);
        # bir kez yeni bağlantıyla denemek çoğu geçici hatayı kullanıcıya yansıtmadan çözer.
        return await aw(supabase.auth.get_user(token))


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserProfile:
    """
    Validate the token from the Authorization header and return the user profile.
    Raises HTTPException if the token is invalid or user is not found.

    Önce yerel JWT doğrulaması (ağ çağrısı yok); yerelde karar verilemezse Supabase Auth.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection is not configured."
        )

    claims = await _verify_locally(token)
    if claims is not None:
        return _profile_from_claims(claims)

    try:
        user_response = await _get_user(token)
        if hasattr(user_response, 'user') and user_response.user:
            return _profile_from_user(user_response.user)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    except HTTPException:
        raise
    except _TRANSIENT as e:
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
