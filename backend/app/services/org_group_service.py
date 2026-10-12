"""
Faz 4C — gruplar (kohort) ve toplu davet.

Gruplar: kurum içi sınıf/şube. Her üye en fazla bir gruptadır
(memberships.group_id); panel ve ödevler gruba daraltılabilir.

Toplu davet: eğitmen CSV'den e-posta listesi yükler; bunlar BEKLEYEN davet
olur. Kullanıcı kuruma ancak "Kurumlarım" sayfasında daveti kendisi kabul
edince eklenir — kimse rızası olmadan bir kuruma üye yapılmaz (KVKK).
Davet e-postayla eşleşir; kabul eden kullanıcının oturumdaki e-postası davetle
aynı olmak zorundadır.
"""
import re
from typing import Any, Dict, Iterable, List, Optional

from app.core.database import supabase
from app.services import organization_service

MAX_INVITES = 500
_EMAIL = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$")


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def normalize_email(value: Optional[str]) -> Optional[str]:
    email = (value or "").strip().strip('"').lower()
    return email if _EMAIL.match(email) and len(email) <= 254 else None


# --- gruplar ---

async def list_groups(org_id: str, memberships: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups = _db().table("org_groups").select("id, name, created_at").eq("org_id", org_id).order("name").execute().data or []
    counts: Dict[str, int] = {}
    for m in memberships:
        if m.get("group_id"):
            counts[str(m["group_id"])] = counts.get(str(m["group_id"]), 0) + 1
    return [{**g, "member_count": counts.get(str(g["id"]), 0)} for g in groups]


async def get_group(org_id: str, group_id: str) -> Optional[Dict[str, Any]]:
    result = _db().table("org_groups").select("*").eq("id", group_id).eq("org_id", org_id).execute()
    return result.data[0] if result.data else None


async def create_group(actor_id: str, org_id: str, name: str) -> Dict[str, Any]:
    name = name.strip()
    existing = _db().table("org_groups").select("id").eq("org_id", org_id).eq("name", name).execute().data
    if existing:
        raise ValueError(f"'{name}' adlı bir grup zaten var")
    result = _db().table("org_groups").insert({"org_id": org_id, "name": name}).execute()
    if not result.data:
        raise RuntimeError("Grup oluşturulamadı")
    group = result.data[0]
    await organization_service.log_audit(actor_id, org_id, "group.create", "group", group["id"])
    return {**group, "member_count": 0}


async def delete_group(actor_id: str, org_id: str, group_id: str) -> bool:
    """Grubu siler; üyeler kurumda kalır, yalnızca grupsuz olur (FK on delete set null)."""
    if not await get_group(org_id, group_id):
        return False
    _db().table("org_groups").delete().eq("id", group_id).eq("org_id", org_id).execute()
    await organization_service.log_audit(actor_id, org_id, "group.delete", "group", group_id)
    return True


async def set_member_group(actor_id: str, org_id: str, user_id: str, group_id: Optional[str]) -> None:
    if not await organization_service.get_membership(org_id, user_id):
        raise ValueError("Üye bulunamadı")
    if group_id and not await get_group(org_id, group_id):
        raise ValueError("Grup bulunamadı")
    _db().table("memberships").update({"group_id": group_id}).eq("org_id", org_id).eq("user_id", user_id).execute()
    await organization_service.log_audit(actor_id, org_id, "member.group_change", "user", user_id, {"group_id": group_id})


async def _group_ids_by_name(actor_id: str, org_id: str, names: Iterable[str]) -> Dict[str, str]:
    wanted = {n.strip() for n in names if n and n.strip()}
    if not wanted:
        return {}
    rows = _db().table("org_groups").select("id, name").eq("org_id", org_id).execute().data or []
    by_name = {r["name"].casefold(): r["id"] for r in rows}
    for name in sorted(wanted):
        if name.casefold() not in by_name:
            created = await create_group(actor_id, org_id, name[:60])
            by_name[name.casefold()] = created["id"]
    return {name: by_name[name.casefold()] for name in wanted}


# --- toplu davet ---

def plan_invites(rows: List[Dict[str, Optional[str]]], member_emails: Iterable[str]) -> Dict[str, Any]:
    """
    Saf ön işleme (test edilebilir): geçersiz satırları, zaten üye olanları ve
    tekrarları ayırır. Aynı e-posta birden çok kez geçerse ilk satır geçerlidir.
    """
    members = {e.lower() for e in member_emails if e}
    valid: Dict[str, Optional[str]] = {}
    invalid: List[str] = []
    already: List[str] = []
    for row in rows:
        raw = (row.get("email") or "").strip()
        email = normalize_email(raw)
        if not email:
            if raw:
                invalid.append(raw[:100])
            continue
        if email in members:
            if email not in already:
                already.append(email)
            continue
        valid.setdefault(email, (row.get("group") or "").strip() or None)
    return {"valid": valid, "invalid": invalid, "already_member": already}


async def create_invites(actor_id: str, org_id: str, rows: List[Dict[str, Optional[str]]], role: str,
                         default_group_id: Optional[str], member_emails: Iterable[str]) -> Dict[str, Any]:
    plan = plan_invites(rows[:MAX_INVITES], member_emails)
    group_ids = await _group_ids_by_name(actor_id, org_id, [g for g in plan["valid"].values() if g])
    records = [
        {"org_id": org_id, "email": email, "role": role, "invited_by": actor_id,
         "group_id": group_ids.get(group) if group else default_group_id}
        for email, group in plan["valid"].items()
    ]
    if records:
        # Aynı e-postaya tekrar davet: rol/grup güncellenir, yeni satır açılmaz.
        _db().table("org_invites").upsert(records, on_conflict="org_id,email").execute()
        await organization_service.log_audit(actor_id, org_id, "invite.bulk_create", "organization", org_id,
                                             {"count": len(records)})
    return {
        "invited": len(records),
        "already_member": plan["already_member"],
        "invalid": plan["invalid"],
        "truncated": max(0, len(rows) - MAX_INVITES),
    }


async def list_org_invites(org_id: str) -> List[Dict[str, Any]]:
    return (
        _db().table("org_invites").select("id, email, role, group_id, created_at")
        .eq("org_id", org_id).order("created_at", desc=True).execute().data or []
    )


async def delete_invite(actor_id: str, org_id: str, invite_id: str) -> bool:
    found = _db().table("org_invites").select("id").eq("id", invite_id).eq("org_id", org_id).execute().data
    if not found:
        return False
    _db().table("org_invites").delete().eq("id", invite_id).eq("org_id", org_id).execute()
    await organization_service.log_audit(actor_id, org_id, "invite.delete", "invite", invite_id)
    return True


async def my_invites(email: Optional[str]) -> List[Dict[str, Any]]:
    email = normalize_email(email)
    if not email:
        return []
    invites = _db().table("org_invites").select("id, org_id, role, created_at").eq("email", email).execute().data or []
    if not invites:
        return []
    orgs = _db().table("organizations").select("id, name").in_("id", [i["org_id"] for i in invites]).execute().data or []
    names = {o["id"]: o["name"] for o in orgs}
    return [{**i, "org_name": names.get(i["org_id"])} for i in invites]


async def respond_to_invite(user_id: str, email: Optional[str], invite_id: str, accept: bool) -> Dict[str, Any]:
    result = _db().table("org_invites").select("*").eq("id", invite_id).execute()
    invite = result.data[0] if result.data else None
    # Başkasına ait davet "yok" gibi davranır (varlığı sızdırılmaz).
    if not invite or invite["email"] != normalize_email(email):
        raise ValueError("Davet bulunamadı")

    if accept and not await organization_service.get_membership(invite["org_id"], user_id):
        _db().table("memberships").insert({
            "org_id": invite["org_id"], "user_id": user_id, "role": invite["role"], "group_id": invite.get("group_id"),
        }).execute()
    _db().table("org_invites").delete().eq("id", invite_id).execute()
    await organization_service.log_audit(user_id, invite["org_id"], "invite.accept" if accept else "invite.decline",
                                         "user", user_id)
    return {"org_id": invite["org_id"], "accepted": accept}
