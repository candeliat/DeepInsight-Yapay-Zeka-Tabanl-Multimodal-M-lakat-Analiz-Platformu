"""
Faz 5 — KVKK veri hakları (6698 sayılı Kanun md. 11): kişinin kendisi hakkında
işlenen verileri öğrenme/alma ve silinmesini isteme hakkı.

- export_user_data: kullanıcının platformdaki tüm kişisel verisini tek bir JSON
  belgesinde döner (mülakatlar ve mesajları, video/ses analizleri, CV'ler ve
  analizleri, ilanlar, eşleşmeler, onamlar, kurum üyelikleri, anketler, kendi
  işlemlerinin denetim kaydı).
- delete_account: tüm kişisel veriyi ve Supabase Auth hesabını siler.
  Kurum verisi (kurumun kendi soru bankası, oluşturulan ödevler) kuruma aittir
  ve silinmez; bu kayıtlarda yalnızca artık hiçbir hesaba bağlanmayan bir
  kullanıcı kimliği (UUID) kalır. Denetim kaydı (kim ne zaman hangi işlemi
  yaptı) yasal yükümlülük gereği tutulur; silinen hesapla eşleştirilemez.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.core.database import supabase
from app.services import cv_service, organization_service

logger = logging.getLogger(__name__)

EXPORT_VERSION = "1"


class LastAdminError(Exception):
    pass


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def _rows(table: str, column: str, value: Any, columns: str = "*") -> List[Dict[str, Any]]:
    return _db().table(table).select(columns).eq(column, value).execute().data or []


def _rows_in(table: str, column: str, values: List[str], columns: str = "*") -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for start in range(0, len(values), 100):
        out.extend(_db().table(table).select(columns).in_(column, values[start:start + 100]).execute().data or [])
    return out


def export_user_data(user_id: str, email: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    interviews = _rows("interviews", "user_id", user_id)
    interview_ids = [str(i["id"]) for i in interviews]
    messages = _rows_in("interview_messages", "interview_id", interview_ids, "interview_id, role, content, created_at")
    analytics = _rows_in("interview_analytics", "interview_id", interview_ids)
    by_interview: Dict[str, List[Dict[str, Any]]] = {}
    for m in sorted(messages, key=lambda m: m.get("created_at") or ""):
        by_interview.setdefault(str(m["interview_id"]), []).append({k: m[k] for k in ("role", "content", "created_at")})
    analytics_by = {str(a["interview_id"]): a for a in analytics}

    cvs = _rows("cvs", "user_id", user_id)
    memberships = _rows("memberships", "user_id", user_id)
    org_names = {
        o["id"]: o["name"]
        for o in _rows_in("organizations", "id", [str(m["org_id"]) for m in memberships], "id, name")
    }
    return {
        "export_version": EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": {"id": user_id, "email": email, **profile},
        "consents": _rows("user_consents", "user_id", user_id),
        "organizations": [{**m, "org_name": org_names.get(m["org_id"])} for m in memberships],
        "pending_invites": _rows("org_invites", "email", (email or "").strip().lower(), "org_id, role, created_at"),
        "interviews": [
            {**i, "messages": by_interview.get(str(i["id"]), []), "video_analysis": analytics_by.get(str(i["id"]))}
            for i in interviews
        ],
        "cvs": cvs,
        "cv_analyses": _rows("cv_analyses", "user_id", user_id),
        "job_postings": _rows("job_postings", "user_id", user_id),
        "job_matches": _rows("job_matches", "user_id", user_id),
        "survey_responses": _rows("survey_responses", "user_id", user_id),
        "activity_log": (
            _db().table("audit_log").select("action, target_type, created_at").eq("actor_id", user_id)
            .order("created_at", desc=True).limit(500).execute().data or []
        ),
    }


async def _ensure_not_last_admin(user_id: str) -> None:
    for m in _rows("memberships", "user_id", user_id, "org_id, role"):
        if m["role"] != "org_admin":
            continue
        admins = _rows("memberships", "org_id", m["org_id"], "user_id, role")
        if sum(1 for a in admins if a["role"] == "org_admin") <= 1:
            org = await organization_service.get_organization(m["org_id"])
            raise LastAdminError(
                f"\"{(org or {}).get('name', 'Bir kurum')}\" kurumunun tek yöneticisisiniz. "
                "Hesabınızı silmeden önce başka bir üyeyi kurum yöneticisi yapın."
            )


async def delete_account(user_id: str, email: str) -> Dict[str, int]:
    """Tüm kişisel veriyi ve Auth hesabını siler. Silinen kayıt sayılarını döner."""
    await _ensure_not_last_admin(user_id)
    counts: Dict[str, int] = {}

    # CV'ler: depolamadaki dosya + satır (cv_analyses ve job_matches zincirleme silinir).
    cvs = await cv_service.list_cvs(user_id)
    for cv in cvs:
        await cv_service.delete_cv(user_id, cv["id"])
    counts["cvs"] = len(cvs)

    for table in ("job_matches", "job_postings"):
        counts[table] = len(_db().table(table).delete().eq("user_id", user_id).execute().data or [])

    # interview_messages -> interviews FK'si zincirleme değil: önce mesajlar silinir.
    interview_ids = [str(i["id"]) for i in _rows("interviews", "user_id", user_id, "id")]
    for start in range(0, len(interview_ids), 100):
        _db().table("interview_messages").delete().in_("interview_id", interview_ids[start:start + 100]).execute()
    # interview_analytics ve survey_responses(post_interview) zincirleme silinir.
    counts["interviews"] = len(_db().table("interviews").delete().eq("user_id", user_id).execute().data or [])

    for table in ("survey_responses", "user_consents", "memberships"):
        counts[table] = len(_db().table(table).delete().eq("user_id", user_id).execute().data or [])
    if email:
        _db().table("org_invites").delete().eq("email", email.strip().lower()).execute()

    await organization_service.log_audit(user_id, None, "account.delete", "user", user_id, counts)
    _db().auth.admin.delete_user(user_id)
    logger.info("[account] Hesap silindi (user_id=%s): %s", user_id, counts)
    return counts
