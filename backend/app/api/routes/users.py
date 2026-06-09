from fastapi import APIRouter, Depends
from app.api.schemas.user import UserProfile
from app.api.dependencies.auth import get_current_user

router = APIRouter()

@router.get("/me", response_model=UserProfile)
def read_users_me(current_user: UserProfile = Depends(get_current_user)):
    """
    Get the currently logged-in user profile.
    Requires a valid JWT Bearer token.
    """
    # Simply return the user verified and fetched by the dependency
    return current_user
