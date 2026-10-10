from typing import List

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.assignment import MyAssignmentItem
from app.api.schemas.user import UserProfile
from app.services import assignment_service

router = APIRouter()


@router.get("/me", response_model=List[MyAssignmentItem])
async def my_assignments(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Öğrencinin öğrenci olduğu tüm kurumlardaki ödevleri, kendi durumu ve skoruyla."""
    return await assignment_service.my_assignments(current_user.id)
