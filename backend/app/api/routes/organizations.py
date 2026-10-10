import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies.auth import get_current_user, oauth2_scheme, require_admin, require_org_role
from app.api.schemas.organization import (
    JoinOrganizationRequest,
    MemberItem,
    MyOrganizationItem,
    OrganizationCreate,
    OrganizationDetail,
    OrganizationItem,
    UpdateMemberRoleRequest,
)
from app.api.schemas.user import UserProfile
from app.services import organization_service as org_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=OrganizationDetail)
async def create_organization(
    payload: OrganizationCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Yeni kurum oluşturur (yalnızca platform admini). `admin_email` verilirse
    o kullanıcı kurumun ilk yöneticisi olur, verilmezse oluşturan kişi olur."""
    try:
        return await org_service.create_organization(payload.name, current_user.id, payload.admin_email)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/me", response_model=List[MyOrganizationItem])
async def my_organizations(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await org_service.list_user_orgs(current_user.id)


@router.post("/join", response_model=OrganizationItem)
async def join_organization(
    payload: JoinOrganizationRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        return await org_service.join_by_invite_code(current_user.id, payload.invite_code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{org_id}", response_model=OrganizationDetail)
async def get_organization(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin")),
):
    org = await org_service.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    return org


@router.get("/{org_id}/members", response_model=List[MemberItem])
async def list_members(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    return await org_service.list_members(org_id)


@router.patch("/{org_id}/members/{user_id}", response_model=MemberItem)
async def update_member_role(
    org_id: str,
    user_id: str,
    payload: UpdateMemberRoleRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin")),
):
    try:
        return await org_service.update_member_role(current_user.id, org_id, user_id, payload.role)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(
    org_id: str,
    user_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin")),
):
    try:
        await org_service.remove_member(current_user.id, org_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "removed"}


@router.post("/{org_id}/invite-code/rotate")
async def rotate_invite_code(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin")),
):
    """Eski davet kodunu geçersiz kılıp yenisini üretir."""
    return {"invite_code": await org_service.rotate_invite_code(current_user.id, org_id)}
