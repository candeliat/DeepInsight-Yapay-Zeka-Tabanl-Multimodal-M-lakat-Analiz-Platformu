"""
Geri bildirim: hata bildirimi (bug) ve özellik önerisi (feature), isteğe bağlı ekran görüntüsüyle.

Ekran görüntüsü özel `feedback` bucket'ında `{user_id}/{uuid}.{ext}` yoluyla tutulur; türü
dosyanın ilk baytlarından doğrulanır (uzantıya/istemcinin söylediği türe güvenilmez). Admin
listesinde görüntüler kısa ömürlü imzalı URL ile verilir. Durum akışı:
yeni -> inceleniyor -> planlandı -> çözüldü / reddedildi.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import run, supabase
from app.services import organization_service

BUCKET = "feedback"
MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
SIGNED_URL_TTL = 3600
KINDS = {"bug", "feature"}
STATUSES = ["new", "triaged", "planned", "resolved", "rejected"]
_COLUMNS = "id, user_id, kind, title, description, page, platform, user_agent, screenshot_path, status, admin_note, created_at, updated_at"

_bucket_ready = False


class InvalidScreenshot(ValueError):
    pass


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


def image_type(data: bytes) -> Optional[str]:
    """Sihirli baytlardan görsel türü (png/jpg/webp); tanınmazsa None."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


async def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    existing = {b.name for b in await _db().storage.list_buckets()}
    if BUCKET not in existing:
        await _db().storage.create_bucket(BUCKET, options={"public": False})
    _bucket_ready = True


def _clean(text: Optional[str], limit: int) -> Optional[str]:
    if text is None:
        return None
    text = " ".join(str(text).replace("\x00", "").split()) if limit <= 300 else str(text).replace("\x00", "").strip()
    return text[:limit] or None


async def create_feedback(user_id: str, kind: str, title: str, description: str, page: Optional[str] = None,
                          platform: Optional[str] = None, user_agent: Optional[str] = None,
                          screenshot: Optional[bytes] = None) -> Dict[str, Any]:
    if kind not in KINDS:
        raise ValueError("Tür 'bug' ya da 'feature' olmalı.")
    path = None
    if screenshot:
        if len(screenshot) > MAX_SCREENSHOT_BYTES:
            raise InvalidScreenshot("Ekran görüntüsü en fazla 5 MB olabilir.")
        ext = image_type(screenshot)
        if not ext:
            raise InvalidScreenshot("Ekran görüntüsü PNG, JPG ya da WEBP olmalı.")
        await _ensure_bucket()
        path = f"{user_id}/{uuid.uuid4()}.{ext}"
        await _db().storage.from_(BUCKET).upload(path, screenshot, {"content-type": f"image/{'jpeg' if ext == 'jpg' else ext}"})
    record = {
        "user_id": user_id,
        "kind": kind,
        "title": _clean(title, 150),
        "description": _clean(description, 4000),
        "page": _clean(page, 300),
        "platform": platform if platform in ("web", "mobile") else None,
        "user_agent": _clean(user_agent, 300),
        "screenshot_path": path,
    }
    try:
        result = await run(_db().table("feedback").insert(record))
        if not result.data:
            raise RuntimeError("Geri bildirim kaydedilemedi")
    except Exception:
        if path:
            await _db().storage.from_(BUCKET).remove([path])  # yetim dosya bırakma
        raise
    return result.data[0]


async def list_mine(user_id: str) -> List[Dict[str, Any]]:
    rows = (await run(_db().table("feedback").select("id, kind, title, status, admin_note, created_at, updated_at")
                      .eq("user_id", user_id).order("created_at", desc=True).limit(50))).data or []
    return rows


async def _signed_urls(paths: List[str]) -> Dict[str, Optional[str]]:
    if not paths:
        return {}
    try:
        signed = await _db().storage.from_(BUCKET).create_signed_urls(paths, SIGNED_URL_TTL)
    except Exception:
        return {}
    out: Dict[str, Optional[str]] = {}
    for item in signed or []:
        url = item.get("signedURL") or item.get("signedUrl")
        if item.get("path") and url:
            out[item["path"]] = url
    return out


async def list_all(kind: Optional[str] = None, status: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    """Admin: tüm geri bildirimler, gönderenin adı/e-postası ve ekran görüntüsü bağlantısıyla."""
    query = _db().table("feedback").select(_COLUMNS).order("created_at", desc=True).limit(limit)
    if kind:
        query = query.eq("kind", kind)
    if status:
        query = query.eq("status", status)
    rows = (await run(query)).data or []

    user_ids = sorted({str(r["user_id"]) for r in rows if r.get("user_id")})
    people: Dict[str, Dict[str, Any]] = {}
    if user_ids:
        prof = (await run(_db().table("profiles").select("id, email, first_name, last_name").in_("id", user_ids))).data or []
        people = {str(p["id"]): p for p in prof}
    urls = await _signed_urls([r["screenshot_path"] for r in rows if r.get("screenshot_path")])
    out = []
    for r in rows:
        p = people.get(str(r.get("user_id"))) or {}
        name = " ".join(x for x in (p.get("first_name"), p.get("last_name")) if x) or None
        out.append({**{k: v for k, v in r.items() if k != "screenshot_path"},
                    "user_email": p.get("email"), "user_name": name,
                    "screenshot_url": urls.get(r.get("screenshot_path")) if r.get("screenshot_path") else None,
                    "has_screenshot": bool(r.get("screenshot_path"))})
    return out


async def update(actor_id: str, feedback_id: str, status: Optional[str], admin_note: Optional[str]) -> Optional[Dict[str, Any]]:
    values: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if status is not None:
        if status not in STATUSES:
            raise ValueError("Geçersiz durum.")
        values["status"] = status
    if admin_note is not None:
        values["admin_note"] = _clean(admin_note, 2000)
    result = await run(_db().table("feedback").update(values).eq("id", feedback_id))
    if not result.data:
        return None
    await organization_service.log_audit(actor_id, None, "feedback.update", "feedback", feedback_id,
                                         {k: values[k] for k in ("status",) if k in values})
    return result.data[0]


async def delete_for_user(user_id: str) -> int:
    """Hesap silme: kullanıcının bildirimleri ve ekran görüntüleri."""
    rows = (await run(_db().table("feedback").select("id, screenshot_path").eq("user_id", user_id))).data or []
    paths = [r["screenshot_path"] for r in rows if r.get("screenshot_path")]
    if paths:
        try:
            await _db().storage.from_(BUCKET).remove(paths)
        except Exception:
            pass
    await run(_db().table("feedback").delete().eq("user_id", user_id))
    return len(rows)
