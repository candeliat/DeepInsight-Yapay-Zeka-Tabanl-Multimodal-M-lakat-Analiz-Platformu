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

from app.core.database import run, aw, supabase
from app.services import cv_service, organization_service

logger = logging.getLogger(__name__)

EXPORT_VERSION = "1"

# --- Video analizi onamı ---------------------------------------------------
# Görüntülü mülakatta video sunucuya yüklenir; yüz ifadesinden duygu/stres, göz
# teması ve konuşma metrikleri çıkarılır. Bu, CV'den daha hassas bir veri olduğu
# için ayrı ve açık bir onam gerekir. Onam yoksa backend video kabul etmez.
VIDEO_CONSENT_TYPE = "video_analysis"
VIDEO_CONSENT_VERSION = "2026-10-v1"
VIDEO_CONSENT_TEXT = (
    "Görüntülü mülakatta kameranızın ve mikrofonunuzun kaydı, mülakat bittikten sonra analiz için sunucularımıza "
    "yüklenir. Kayıttan yüz ifadeleriniz (duygu ve stres tahmini), göz temasınız, konuşma hızınız, duraksamalarınız "
    "ve dolgu kelimeleriniz çıkarılır. Video dosyası analiz tamamlanınca silinir; yalnızca çıkarılan ölçümler ve "
    "konuşma dökümü saklanır. Bu sonuçlar, siz paylaşmadıkça bağlı olduğunuz kurum dahil kimseyle paylaşılmaz. "
    "Onamınızı istediğiniz zaman geri çekebilirsiniz; bu durumda video analizi sonuçlarınız silinir. Onam vermeden "
    "yazılı ya da sesli (kamerasız) mülakat yapmaya devam edebilirsiniz."
)
CONSENTS = {VIDEO_CONSENT_TYPE: (VIDEO_CONSENT_VERSION, VIDEO_CONSENT_TEXT)}


class LastAdminError(Exception):
    pass


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


async def _rows(table: str, column: str, value: Any, columns: str = "*") -> List[Dict[str, Any]]:
    return (await run(_db().table(table).select(columns).eq(column, value))).data or []


async def _rows_in(table: str, column: str, values: List[str], columns: str = "*") -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for start in range(0, len(values), 100):
        out.extend((await run(_db().table(table).select(columns).in_(column, values[start:start + 100]))).data or [])
    return out


async def export_user_data(user_id: str, email: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    interviews = (await aw(_rows("interviews", "user_id", user_id)))
    interview_ids = [str(i["id"]) for i in interviews]
    messages = (await aw(_rows_in("interview_messages", "interview_id", interview_ids, "interview_id, role, content, created_at")))
    analytics = (await aw(_rows_in("interview_analytics", "interview_id", interview_ids)))
    by_interview: Dict[str, List[Dict[str, Any]]] = {}
    for m in sorted(messages, key=lambda m: m.get("created_at") or ""):
        by_interview.setdefault(str(m["interview_id"]), []).append({k: m[k] for k in ("role", "content", "created_at")})
    analytics_by = {str(a["interview_id"]): a for a in analytics}

    cvs = (await aw(_rows("cvs", "user_id", user_id)))
    memberships = (await aw(_rows("memberships", "user_id", user_id)))
    org_names = {
        o["id"]: o["name"]
        for o in (await aw(_rows_in("organizations", "id", [str(m["org_id"]) for m in memberships], "id, name")))
    }
    return {
        "export_version": EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": {"id": user_id, "email": email, **profile},
        "consents": (await aw(_rows("user_consents", "user_id", user_id))),
        "organizations": [{**m, "org_name": org_names.get(m["org_id"])} for m in memberships],
        "pending_invites": (await aw(_rows("org_invites", "email", (email or "").strip().lower(), "org_id, role, created_at"))),
        "interviews": [
            {**i, "messages": by_interview.get(str(i["id"]), []), "video_analysis": analytics_by.get(str(i["id"]))}
            for i in interviews
        ],
        "cvs": cvs,
        "cv_analyses": (await aw(_rows("cv_analyses", "user_id", user_id))),
        "job_postings": (await aw(_rows("job_postings", "user_id", user_id))),
        "job_matches": (await aw(_rows("job_matches", "user_id", user_id))),
        "survey_responses": (await aw(_rows("survey_responses", "user_id", user_id))),
        "activity_log": (
            (await run(_db().table("audit_log").select("action, target_type, created_at").eq("actor_id", user_id)
            .order("created_at", desc=True).limit(500))).data or []
        ),
    }


async def consent_status(user_id: str, consent_type: str) -> Dict[str, Any]:
    version, text = CONSENTS[consent_type]
    rows = (await aw(_rows("user_consents", "user_id", user_id, "consent_type, revoked_at")))
    row = next((r for r in rows if r.get("consent_type") == consent_type), None)
    return {"consent_type": consent_type, "version": version, "text": text,
            "granted": bool(row) and row.get("revoked_at") is None}


async def has_video_consent(user_id: str) -> bool:
    return (await aw(consent_status(user_id, VIDEO_CONSENT_TYPE)))["granted"]


async def set_consent(user_id: str, consent_type: str, granted: bool) -> Dict[str, Any]:
    version, _ = CONSENTS[consent_type]
    now = datetime.now(timezone.utc).isoformat()
    if granted:
        (await run(_db().table("user_consents").upsert({
            "user_id": user_id, "consent_type": consent_type, "version": version, "granted_at": now, "revoked_at": None,
        }, on_conflict="user_id,consent_type")))
    else:
        if consent_type == VIDEO_CONSENT_TYPE:
            # Onam geri çekilince video analizinden türetilen tüm sonuçlar silinir.
            interview_ids = [str(i["id"]) for i in (await aw(_rows("interviews", "user_id", user_id, "id")))]
            for start in range(0, len(interview_ids), 100):
                (await run(_db().table("interview_analytics").delete().in_("interview_id", interview_ids[start:start + 100])))
        (await run(_db().table("user_consents").update({"revoked_at": now}).eq("user_id", user_id).eq("consent_type", consent_type)))
    return (await aw(consent_status(user_id, consent_type)))


async def _ensure_not_last_admin(user_id: str) -> None:
    for m in (await aw(_rows("memberships", "user_id", user_id, "org_id, role"))):
        if m["role"] != "org_admin":
            continue
        admins = (await aw(_rows("memberships", "org_id", m["org_id"], "user_id, role")))
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
        counts[table] = len((await run(_db().table(table).delete().eq("user_id", user_id))).data or [])

    # interview_messages -> interviews FK'si zincirleme değil: önce mesajlar silinir.
    interview_ids = [str(i["id"]) for i in (await aw(_rows("interviews", "user_id", user_id, "id")))]
    for start in range(0, len(interview_ids), 100):
        (await run(_db().table("interview_messages").delete().in_("interview_id", interview_ids[start:start + 100])))
    # interview_analytics ve survey_responses(post_interview) zincirleme silinir.
    counts["interviews"] = len((await run(_db().table("interviews").delete().eq("user_id", user_id))).data or [])

    for table in ("survey_responses", "user_consents", "memberships"):
        counts[table] = len((await run(_db().table(table).delete().eq("user_id", user_id))).data or [])
    if email:
        (await run(_db().table("org_invites").delete().eq("email", email.strip().lower())))

    await organization_service.log_audit(user_id, None, "account.delete", "user", user_id, counts)
    (await aw(_db().auth.admin.delete_user(user_id)))
    logger.info("[account] Hesap silindi (user_id=%s): %s", user_id, counts)
    return counts
