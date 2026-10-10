import asyncio
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies.auth import get_current_user, oauth2_scheme, require_admin, require_org_role
from app.api.schemas.organization import (
    JoinOrganizationRequest,
    MemberDetail,
    MemberItem,
    MyOrganizationItem,
    OrganizationCreate,
    OrganizationDetail,
    OrganizationItem,
    OrganizationSettingsUpdate,
    SharingRequest,
    UpdateMemberRoleRequest,
)
from app.api.schemas.question_bank_admin import QuestionBankCreate, QuestionBankItem, QuestionBankUpdate
from app.api.schemas.user import UserProfile
from app.services import organization_service as org_service
from app.services import org_insights_service as insights
from app.services import progress_service
from app.services import question_bank_admin_service as question_service

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


@router.get("/{org_id}/members", response_model=List[MemberDetail])
async def list_members(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Üyeler + kurum bağlamındaki katılımları. Skor yalnızca öğrenci paylaşım rızası verdiyse döner."""
    memberships = await org_service.list_members(org_id)
    data = await asyncio.to_thread(progress_service.fetch_org_data, org_id)
    identities = {
        str(m["user_id"]): await asyncio.to_thread(insights.get_identity, str(m["user_id"])) for m in memberships
    }
    return insights.build_member_rows(memberships, data, identities)


@router.get("/{org_id}/overview")
async def org_overview(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Kurum geneli katılım ve (en az 3 öğrenci katkı verdiyse) toplu skor istatistikleri."""
    org = await org_service.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    memberships = await org_service.list_members(org_id)
    data = await asyncio.to_thread(progress_service.fetch_org_data, org_id)
    return insights.build_overview(org, memberships, data)


@router.get("/{org_id}/members/{user_id}/progress")
async def member_progress(
    org_id: str,
    user_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Bir öğrencinin kurum içindeki ilerlemesi — yalnızca öğrenci paylaşım rızası verdiyse."""
    memberships = await org_service.list_members(org_id)
    data = await asyncio.to_thread(progress_service.fetch_org_data, org_id)
    try:
        progress = insights.member_progress(memberships, user_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    await org_service.log_audit(current_user.id, org_id, "member.view_progress", "user", user_id)
    return progress


@router.put("/{org_id}/me/sharing")
async def update_my_sharing(
    org_id: str,
    payload: SharingRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor", "candidate")),
):
    """Öğrenci kendi ilerlemesini bu kurumun eğitmenleriyle paylaşıp paylaşmamayı seçer."""
    try:
        return {"share_progress": await org_service.set_share_progress(org_id, current_user.id, payload.share_progress)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{org_id}", response_model=OrganizationDetail)
async def update_organization(
    org_id: str,
    payload: OrganizationSettingsUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin")),
):
    try:
        return await org_service.update_settings(
            current_user.id, org_id, payload.name, payload.monthly_interview_quota, payload.clear_quota,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


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


# --------------------------------------------------------------------------
# Kuruma özel soru bankası. Tüm işlemler org_id kapsamına sabitlenir
# (bkz. question_bank_admin_service._scope): kurum yalnızca kendi sorularını
# görür/değiştirir; global sorulara dokunamaz.
# --------------------------------------------------------------------------

@router.get("/{org_id}/questions", response_model=List[QuestionBankItem])
async def list_org_questions(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    return await question_service.list_questions(org_id=org_id)


@router.post("/{org_id}/questions", response_model=QuestionBankItem)
async def create_org_question(
    org_id: str,
    payload: QuestionBankCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    try:
        created = await question_service.create_question(
            role=payload.role,
            topic=payload.topic,
            difficulty=payload.difficulty,
            question_text=payload.question_text,
            tags=payload.tags,
            family_id=payload.family_id,
            new_family=payload.new_family,
            org_id=org_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    await org_service.log_audit(current_user.id, org_id, "question.create", "question", str(created.get("id")))
    return created


@router.patch("/{org_id}/questions/{question_id}", response_model=QuestionBankItem)
async def update_org_question(
    org_id: str,
    question_id: str,
    payload: QuestionBankUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    try:
        updated = await question_service.update_question(question_id, payload.model_dump(), org_id=org_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e) or "Soru bulunamadı")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    await org_service.log_audit(current_user.id, org_id, "question.update", "question", question_id)
    return updated


@router.delete("/{org_id}/questions/{question_id}")
async def delete_org_question(
    org_id: str,
    question_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    try:
        await question_service.delete_question(question_id, org_id=org_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    await org_service.log_audit(current_user.id, org_id, "question.delete", "question", question_id)
    return {"status": "deleted"}
