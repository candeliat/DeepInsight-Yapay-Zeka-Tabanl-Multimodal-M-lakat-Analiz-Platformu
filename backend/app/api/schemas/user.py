from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, Dict, Any

# Kayıtta kabul edilen KVKK aydınlatma metni sürümü (metin: dashboard /gizlilik,
# mobil /privacy). Metin değişirse sürüm artırılır; kullanıcı kaydında saklanır.
PRIVACY_NOTICE_VERSION = "2026-10-v1"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: Optional[str] = Field(default=None, max_length=60)
    last_name: Optional[str] = Field(default=None, max_length=60)
    target: Optional[str] = Field(default=None, max_length=80)
    # Aydınlatma metninin okunduğu onayı zorunludur (KVKK md. 10).
    privacy_accepted: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    user: Dict[str, Any]


class UserProfile(BaseModel):
    id: str
    email: str
    created_at: str
    user_metadata: Dict[str, Any]
    app_metadata: Dict[str, Any] = {}


class UserUpdate(BaseModel):
    """Kullanıcının kendi profil alanları (Supabase user_metadata)."""
    first_name: Optional[str] = Field(default=None, max_length=60)
    last_name: Optional[str] = Field(default=None, max_length=60)
    target: Optional[str] = Field(default=None, max_length=80)

    @field_validator("first_name", "last_name", "target")
    @classmethod
    def _clean(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return " ".join(v.replace("<", " ").replace(">", " ").split())
