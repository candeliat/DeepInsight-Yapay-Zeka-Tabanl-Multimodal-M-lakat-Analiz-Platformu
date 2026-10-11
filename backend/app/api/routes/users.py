from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas.user import UserProfile, UserUpdate
from app.api.dependencies.auth import get_current_user
from app.core.database import supabase

router = APIRouter()

@router.get("/me", response_model=UserProfile)
def read_users_me(current_user: UserProfile = Depends(get_current_user)):
    """
    Get the currently logged-in user profile.
    Requires a valid JWT Bearer token.
    """
    # Simply return the user verified and fetched by the dependency
    return current_user


@router.patch("/me", response_model=UserProfile)
async def update_users_me(payload: UserUpdate, current_user: UserProfile = Depends(get_current_user)):
    """Ad, soyad ve hedef pozisyonu günceller (hedef pozisyon mülakat kurulumunda rolü önceden doldurur)."""
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=422, detail="Güncellenecek alan yok")
    metadata = {**(current_user.user_metadata or {}), **changes}
    supabase.auth.admin.update_user_by_id(current_user.id, {"user_metadata": metadata})
    return {**current_user.model_dump(), "user_metadata": metadata}
