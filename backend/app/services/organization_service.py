"""
Kurum (tenant) yönetimi: kurum oluşturma, üyelik, davet kodu, denetim kaydı.

Tüm tablolara service_role ile erişilir (bkz. sql/006_organizations.sql: RLS
açık, politika yok). Yetki kontrolü bu modülde değil, çağıran route'larda
`require_org_role` ile yapılır — bu modül "kim ne yapabilir"i bilmez.
"""
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import supabase

logger = logging.getLogger(__name__)


class QuotaExceededError(Exception):
    pass


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def _new_invite_code() -> str:
    return secrets.token_urlsafe(6)


def _find_user_id_by_email(email: str) -> Optional[str]:
    target = email.strip().lower()
    page = 1
    while True:
        response = _db().auth.admin.list_users(page=page, per_page=200)
        users = response if isinstance(response, list) else getattr(response, "users", [])
        if not users:
            return None
        for user in users:
            if (user.email or "").strip().lower() == target:
                return user.id
        if len(users) < 200:
            return None
        page += 1


async def create_organization(name: str, created_by: str, admin_email: Optional[str] = None) -> Dict[str, Any]:
    admin_user_id = created_by
    if admin_email:
        admin_user_id = _find_user_id_by_email(admin_email)
        if not admin_user_id:
            raise ValueError(f"'{admin_email}' e-postasıyla kayıtlı kullanıcı bulunamadı.")

    result = _db().table("organizations").insert({
        "name": name.strip(),
        "invite_code": _new_invite_code(),
        "created_by": created_by,
    }).execute()
    if not result.data:
        raise RuntimeError("Kurum oluşturulamadı")
    org = result.data[0]

    _db().table("memberships").insert({
        "org_id": org["id"], "user_id": admin_user_id, "role": "org_admin",
    }).execute()
    await log_audit(created_by, org["id"], "org.create", "organization", org["id"])
    return org


async def list_user_orgs(user_id: str) -> List[Dict[str, Any]]:
    memberships = _db().table("memberships").select("org_id, role").eq("user_id", user_id).execute().data or []
    if not memberships:
        return []
    org_ids = [m["org_id"] for m in memberships]
    orgs = _db().table("organizations").select("id, name, created_at").in_("id", org_ids).execute().data or []
    role_by_org = {m["org_id"]: m["role"] for m in memberships}
    return [{**org, "role": role_by_org[org["id"]]} for org in orgs]


async def get_membership(org_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    result = (
        _db().table("memberships").select("*").eq("org_id", org_id).eq("user_id", user_id).execute()
    )
    return result.data[0] if result.data else None


async def get_organization(org_id: str) -> Optional[Dict[str, Any]]:
    result = _db().table("organizations").select("*").eq("id", org_id).execute()
    return result.data[0] if result.data else None


async def join_by_invite_code(user_id: str, invite_code: str) -> Dict[str, Any]:
    result = _db().table("organizations").select("id, name, created_at").eq("invite_code", invite_code.strip()).execute()
    if not result.data:
        raise ValueError("Geçersiz davet kodu")
    org = result.data[0]

    if not await get_membership(org["id"], user_id):
        _db().table("memberships").insert({
            "org_id": org["id"], "user_id": user_id, "role": "candidate",
        }).execute()
        await log_audit(user_id, org["id"], "member.join", "user", user_id)
    return org


async def list_members(org_id: str) -> List[Dict[str, Any]]:
    result = _db().table("memberships").select("user_id, role, created_at").eq("org_id", org_id).execute()
    return result.data or []


async def _count_admins(org_id: str) -> int:
    result = _db().table("memberships").select("user_id").eq("org_id", org_id).eq("role", "org_admin").execute()
    return len(result.data or [])


async def update_member_role(actor_id: str, org_id: str, user_id: str, role: str) -> Dict[str, Any]:
    current = await get_membership(org_id, user_id)
    if not current:
        raise ValueError("Üye bulunamadı")
    if current["role"] == "org_admin" and role != "org_admin" and await _count_admins(org_id) <= 1:
        raise PermissionError("Kurumun son yöneticisinin rolü değiştirilemez")

    _db().table("memberships").update({"role": role}).eq("org_id", org_id).eq("user_id", user_id).execute()
    await log_audit(actor_id, org_id, "member.role_change", "user", user_id, {"role": role})
    return {"user_id": user_id, "role": role}


async def remove_member(actor_id: str, org_id: str, user_id: str) -> None:
    current = await get_membership(org_id, user_id)
    if not current:
        raise ValueError("Üye bulunamadı")
    if current["role"] == "org_admin" and await _count_admins(org_id) <= 1:
        raise PermissionError("Kurumun son yöneticisi çıkarılamaz")

    _db().table("memberships").delete().eq("org_id", org_id).eq("user_id", user_id).execute()
    await log_audit(actor_id, org_id, "member.remove", "user", user_id)


async def rotate_invite_code(actor_id: str, org_id: str) -> str:
    code = _new_invite_code()
    _db().table("organizations").update({"invite_code": code}).eq("id", org_id).execute()
    await log_audit(actor_id, org_id, "org.invite_rotate", "organization", org_id)
    return code


async def check_interview_quota(org_id: str) -> None:
    """
    Kurumun bu ayki mülakat sayısı `monthly_interview_quota`'ya ulaştıysa
    QuotaExceededError fırlatır. Kota null ise sınırsızdır. LLM maliyetini
    kurum bazında sınırlamak için `/interview/start` öncesinde çağrılır.
    """
    org = await get_organization(org_id)
    if not org:
        raise ValueError("Kurum bulunamadı")
    quota = org.get("monthly_interview_quota")
    if quota is None:
        return

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    used = (
        _db().table("interviews").select("id", count="exact")
        .eq("org_id", org_id).gte("created_at", month_start).execute()
    ).count or 0
    if used >= quota:
        raise QuotaExceededError(f"Kurumun aylık mülakat kotası doldu ({used}/{quota}).")


async def log_audit(
    actor_id: str,
    org_id: Optional[str],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    """Best-effort: denetim kaydı yazılamazsa asıl işlemi ASLA engellemez."""
    try:
        _db().table("audit_log").insert({
            "actor_id": actor_id,
            "org_id": org_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta or {},
        }).execute()
    except Exception:
        logger.warning("[organization_service] Denetim kaydı yazılamadı (action=%s).", action, exc_info=True)
