import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.database import aw
from app.api.dependencies.auth import get_current_user, oauth2_scheme, require_admin, require_org_role
from app.api.schemas.organization import (
    BulkInviteRequest,
    BulkInviteResult,
    GroupCreate,
    GroupItem,
    JoinOrganizationRequest,
    MemberDetail,
    MemberGroupRequest,
    MemberItem,
    MyInviteItem,
    MyOrganizationItem,
    OrganizationCreate,
    OrganizationDetail,
    OrganizationItem,
    OrganizationSettingsUpdate,
    OrgInviteItem,
    SharingRequest,
    UpdateMemberRoleRequest,
)
from app.api.schemas.assignment import AssignmentCreate, AssignmentStudentRow, OrgAssignmentItem
from app.api.schemas.notification import ReminderResult
from app.api.schemas.question_bank_admin import QuestionBankCreate, QuestionBankItem, QuestionBankUpdate
from app.api.schemas.user import UserProfile
from app.services import organization_service as org_service
from app.services import assignment_service
from app.services import notification_service
from app.services import org_export_service as export
from app.services import org_group_service as groups
from app.services import org_insights_service as insights
from app.services import progress_service
from app.services import question_bank_admin_service as question_service

logger = logging.getLogger(__name__)
router = APIRouter()


async def _rubric(org_id: str):
    org = await org_service.get_organization(org_id)
    return (org or {}).get("rubric")


async def _check_group(org_id: str, group_id: Optional[str]) -> None:
    if group_id and not await groups.get_group(org_id, group_id):
        raise HTTPException(status_code=404, detail="Grup bulunamadı")


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


# --- Öğrencinin kendisine gelen davetler (Faz 4C). /{org_id} rotalarından önce tanımlı. ---

@router.get("/invites/me", response_model=List[MyInviteItem])
async def my_invites(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await groups.my_invites(current_user.email)


@router.post("/invites/{invite_id}/{decision}")
async def respond_to_invite(
    invite_id: str,
    decision: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Daveti kabul ya da reddeder. Kuruma üyelik yalnızca kullanıcının kendi kabulüyle olur."""
    if decision not in ("accept", "decline"):
        raise HTTPException(status_code=404, detail="Bilinmeyen işlem")
    try:
        return await groups.respond_to_invite(current_user.id, current_user.email, invite_id, decision == "accept")
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
    group_id: Optional[str] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Üyeler + kurum bağlamındaki katılımları. Skor yalnızca öğrenci paylaşım rızası verdiyse döner."""
    return await _member_rows(org_id, group_id)


async def _member_rows(org_id: str, group_id: Optional[str]):
    memberships = await org_service.list_members(org_id)
    # progress_service senkron; iş parçacığına özel istemciyle iş parçacığında çalışır.
    org_data = await asyncio.to_thread(progress_service.fetch_org_data, org_id)
    memberships, data = insights.scope_to_group(memberships, org_data, group_id)
    identities = await insights.get_identities([str(m["user_id"]) for m in memberships])
    return insights.build_member_rows(memberships, data, identities, await _rubric(org_id))


@router.get("/{org_id}/overview")
async def org_overview(
    org_id: str,
    group_id: Optional[str] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Kurum (ya da bir grubu) geneli katılım ve (en az 3 öğrenci katkı verdiyse) toplu skor istatistikleri."""
    org = await org_service.get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    await _check_group(org_id, group_id)
    memberships, data = insights.scope_to_group(
        await org_service.list_members(org_id), await asyncio.to_thread(progress_service.fetch_org_data, org_id), group_id,
    )
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
        progress = insights.member_progress(memberships, user_id, data, await _rubric(org_id))
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
            payload.rubric.model_dump() if payload.rubric else None, payload.clear_rubric,
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


# --------------------------------------------------------------------------
# Ödevler (Faz 4B). Tamamlanma durumu eğitmene görünür (katılım bilgisi);
# ödev mülakatının skoru yalnızca öğrenci paylaşım rızası verdiyse.
# --------------------------------------------------------------------------

@router.post("/{org_id}/assignments", response_model=OrgAssignmentItem)
async def create_assignment(
    org_id: str,
    payload: AssignmentCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    await _check_group(org_id, payload.group_id)
    try:
        created = await assignment_service.create_assignment(current_user.id, org_id, payload.model_dump())
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    members = await org_service.list_members(org_id)
    try:
        org = await org_service.get_organization(org_id)
        await notification_service.notify_assignment_created(created, members, (org or {}).get("name"))
    except Exception:
        # Bildirim yazılamasa da ödev oluşmuştur; öğrenci ödevi "Ödevlerim"de görür.
        logger.exception("[assignments] Yeni ödev bildirimi yazılamadı (assignment_id=%s)", created.get("id"))
    return {**created, "total_candidates": len(assignment_service.targets(created, members))}


@router.post("/{org_id}/assignments/{assignment_id}/remind", response_model=ReminderResult)
async def remind_assignment(
    org_id: str,
    assignment_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Ödevi tamamlamamış öğrencilere uygulama içi hatırlatma (ödev başına 12 saatte bir)."""
    assignment = await assignment_service.get_org_assignment(org_id, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Ödev bulunamadı")
    org = await org_service.get_organization(org_id)
    try:
        return await notification_service.remind_assignment(
            current_user.id, org_id, assignment, await org_service.list_members(org_id), (org or {}).get("name"),
        )
    except notification_service.ReminderTooSoon as e:
        next_at = notification_service.format_due(e.next_at.isoformat())
        raise HTTPException(status_code=429, detail=f"Bu ödev için son 12 saatte hatırlatma gönderildi. Tekrar: {next_at}")
    except Exception:
        logger.exception("[assignments] Hatırlatma gönderilemedi (assignment_id=%s)", assignment_id)
        raise HTTPException(status_code=503, detail="Hatırlatma şu an gönderilemiyor. Biraz sonra tekrar deneyin.")


@router.get("/{org_id}/assignments", response_model=List[OrgAssignmentItem])
async def list_assignments(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    return await assignment_service.list_org_assignments(org_id, await org_service.list_members(org_id))


@router.get("/{org_id}/assignments/{assignment_id}/students", response_model=List[AssignmentStudentRow])
async def assignment_students(
    org_id: str,
    assignment_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    return await _assignment_rows(org_id, assignment_id)


async def _assignment_rows(org_id: str, assignment_id: str):
    assignment = await assignment_service.get_org_assignment(org_id, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Ödev bulunamadı")
    members = await org_service.list_members(org_id)
    interviews = (await aw(assignment_service.assignment_interviews([assignment_id])))
    identities = await insights.get_identities([str(m["user_id"]) for m in members if m["role"] == "candidate"])
    return assignment_service.build_assignment_rows(members, interviews, identities, assignment, await _rubric(org_id))


@router.get("/{org_id}/assignments/{assignment_id}/export.csv")
async def export_assignment(
    org_id: str,
    assignment_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    rows = await _assignment_rows(org_id, assignment_id)
    await org_service.log_audit(current_user.id, org_id, "export.assignment", "assignment", assignment_id)
    return _csv_response(export.assignment_csv(rows), f"odev-{assignment_id[:8]}.csv")


@router.delete("/{org_id}/assignments/{assignment_id}")
async def delete_assignment(
    org_id: str,
    assignment_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    if not await assignment_service.delete_assignment(current_user.id, org_id, assignment_id):
        raise HTTPException(status_code=404, detail="Ödev bulunamadı")
    return {"status": "deleted"}


# --------------------------------------------------------------------------
# Gruplar, toplu davet ve dışa aktarma (Faz 4C).
# --------------------------------------------------------------------------

@router.get("/{org_id}/groups", response_model=List[GroupItem])
async def list_groups(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    return await groups.list_groups(org_id, await org_service.list_members(org_id))


@router.post("/{org_id}/groups", response_model=GroupItem)
async def create_group(
    org_id: str,
    payload: GroupCreate,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    try:
        return await groups.create_group(current_user.id, org_id, payload.name)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{org_id}/groups/{group_id}")
async def delete_group(
    org_id: str,
    group_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    if not await groups.delete_group(current_user.id, org_id, group_id):
        raise HTTPException(status_code=404, detail="Grup bulunamadı")
    return {"status": "deleted"}


@router.put("/{org_id}/members/{user_id}/group")
async def set_member_group(
    org_id: str,
    user_id: str,
    payload: MemberGroupRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    try:
        await groups.set_member_group(current_user.id, org_id, user_id, payload.group_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"user_id": user_id, "group_id": payload.group_id}


@router.get("/{org_id}/invites", response_model=List[OrgInviteItem])
async def list_invites(
    org_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    return await groups.list_org_invites(org_id)


@router.post("/{org_id}/invites", response_model=BulkInviteResult)
async def bulk_invite(
    org_id: str,
    payload: BulkInviteRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """
    CSV'den gelen e-postaları bekleyen davet olarak kaydeder. Kişi kuruma ancak
    "Kurumlarım" sayfasında daveti kendisi kabul edince katılır.
    Eğitmen rolüyle davet yalnızca kurum yöneticisinin yetkisindedir.
    """
    if payload.role == "instructor":
        membership = await org_service.get_membership(org_id, current_user.id)
        if (membership or {}).get("role") != "org_admin" and (current_user.app_metadata or {}).get("role") != "admin":
            raise HTTPException(status_code=403, detail="Eğitmen daveti yalnızca kurum yöneticisi gönderebilir")
    await _check_group(org_id, payload.group_id)
    members = await org_service.list_members(org_id)
    member_emails = [i.get("email") for i in (await insights.get_identities([str(m["user_id"]) for m in members])).values()]
    try:
        return await groups.create_invites(
            current_user.id, org_id, [r.model_dump() for r in payload.rows], payload.role, payload.group_id,
            [e for e in member_emails if e],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/{org_id}/invites/{invite_id}")
async def delete_invite(
    org_id: str,
    invite_id: str,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    if not await groups.delete_invite(current_user.id, org_id, invite_id):
        raise HTTPException(status_code=404, detail="Davet bulunamadı")
    return {"status": "deleted"}


@router.get("/{org_id}/export/members.csv")
async def export_members(
    org_id: str,
    group_id: Optional[str] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_org_role("org_admin", "instructor")),
):
    """Üye listesi CSV'si — skor sütunu yalnızca paylaşım rızası veren öğrenciler için dolu."""
    await _check_group(org_id, group_id)
    rows = await _member_rows(org_id, group_id)
    group_names = {str(g["id"]): g["name"] for g in await groups.list_groups(org_id, [])}
    await org_service.log_audit(current_user.id, org_id, "export.members", "organization", org_id, {"group_id": group_id})
    return _csv_response(export.members_csv(rows, group_names), "uyeler.csv")
