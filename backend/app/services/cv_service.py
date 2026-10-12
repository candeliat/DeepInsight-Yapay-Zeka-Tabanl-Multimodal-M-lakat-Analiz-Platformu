"""
CV yükleme, saklama, silme ve KVKK açık rıza yönetimi.

Dosya özel `cvs` Storage bucket'ında `{user_id}/{uuid}.{ext}` yoluyla tutulur;
metadata + çıkarılan metin `cvs` tablosundadır. Her işlem sahiplik kontrolüyle
yapılır (cvs.user_id = istek yapan kullanıcı) — kurum yöneticileri dahil
başkası bir kullanıcının CV'sine bu modül üzerinden erişemez.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import supabase
from app.services import cv_text_service

logger = logging.getLogger(__name__)

BUCKET = "cvs"
CONSENT_TYPE = "cv_processing"
CONSENT_VERSION = "2026-10-v1"
MAX_CVS_PER_USER = 5

CONSENT_TEXT = (
    "CV'nizi mülakat hazırlığı amacıyla yüklemeyi kabul ediyorsunuz. Dosyanız özel olarak saklanır; "
    "içindeki metin çıkarılır (gerekirse görüntü tanıma/OCR ile) ve CV'nizi analiz etmek, size özel "
    "mülakat soruları üretmek için yapay zekâ servislerine gönderilebilir. CV'nizi ve bu rızayı istediğiniz "
    "zaman silebilirsiniz; rızayı geri çekmeniz yüklediğiniz tüm CV'lerin silinmesine neden olur. "
    "Verileriniz, siz açıkça paylaşmadıkça bağlı olduğunuz kurum dahil kimseyle paylaşılmaz."
)

_EXT_BY_MIME = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


class ConsentRequired(PermissionError):
    pass


class CVLimitReached(Exception):
    pass


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


_bucket_ready = False


def ensure_bucket() -> None:
    """Özel bucket yoksa oluşturur (idempotent; süreç başına bir kez kontrol eder)."""
    global _bucket_ready
    if _bucket_ready:
        return
    existing = {b.name for b in _db().storage.list_buckets()}
    if BUCKET not in existing:
        _db().storage.create_bucket(BUCKET, options={"public": False})
    _bucket_ready = True


# --- KVKK rızası ---

async def has_consent(user_id: str) -> bool:
    rows = (
        _db().table("user_consents").select("revoked_at")
        .eq("user_id", user_id).eq("consent_type", CONSENT_TYPE).execute().data or []
    )
    return bool(rows) and rows[0].get("revoked_at") is None


async def grant_consent(user_id: str) -> None:
    _db().table("user_consents").upsert({
        "user_id": user_id,
        "consent_type": CONSENT_TYPE,
        "version": CONSENT_VERSION,
        "granted_at": datetime.now(timezone.utc).isoformat(),
        "revoked_at": None,
    }, on_conflict="user_id,consent_type").execute()


async def revoke_consent(user_id: str) -> int:
    """Rızayı geri çeker ve kullanıcının TÜM CV'lerini siler. Silinen CV sayısını döner."""
    deleted = 0
    for cv in await list_cvs(user_id):
        await delete_cv(user_id, cv["id"])
        deleted += 1
    _db().table("user_consents").update({
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", user_id).eq("consent_type", CONSENT_TYPE).execute()
    return deleted


# --- CV'ler ---

_LIST_COLUMNS = "id, org_id, original_filename, mime_type, size_bytes, extraction_method, status, created_at"


async def list_cvs(user_id: str) -> List[Dict[str, Any]]:
    result = (
        _db().table("cvs").select(_LIST_COLUMNS)
        .eq("user_id", user_id).order("created_at", desc=True).execute()
    )
    return result.data or []


async def get_cv(user_id: str, cv_id: str) -> Optional[Dict[str, Any]]:
    """Yalnızca sahibine döner; başkasının CV'si 'bulunamadı' gibi davranır."""
    result = _db().table("cvs").select("*").eq("id", cv_id).eq("user_id", user_id).execute()
    return result.data[0] if result.data else None


async def create_cv(user_id: str, data: bytes, original_filename: str, org_id: Optional[str] = None) -> Dict[str, Any]:
    if not await has_consent(user_id):
        raise ConsentRequired("CV yüklemek için önce açık rıza vermelisiniz.")
    if len(await list_cvs(user_id)) >= MAX_CVS_PER_USER:
        raise CVLimitReached(f"En fazla {MAX_CVS_PER_USER} CV saklayabilirsiniz. Önce birini silin.")

    # Dosya türü doğrulaması + metin çıkarma (UnsupportedCVFile -> ValueError).
    text, method, mime, stats = await asyncio.to_thread(cv_text_service.extract_cv_text, data)
    if len(text.strip()) < 30:
        raise ValueError("CV'den okunabilir metin çıkarılamadı. Daha net bir dosya deneyin.")

    ensure_bucket()
    path = f"{user_id}/{uuid.uuid4()}.{_EXT_BY_MIME[mime]}"
    _db().storage.from_(BUCKET).upload(path, data, {"content-type": mime})

    try:
        result = _db().table("cvs").insert({
            "user_id": user_id,
            "org_id": org_id,
            "storage_path": path,
            "original_filename": original_filename[:200],
            "mime_type": mime,
            "size_bytes": len(data),
            "extracted_text": text,
            "extraction_method": method,
            "extraction_stats": stats,
            "status": "parsed",
        }).execute()
        if not result.data:
            raise RuntimeError("CV kaydedilemedi")
    except Exception:
        # Yetim dosya bırakma.
        _db().storage.from_(BUCKET).remove([path])
        raise
    return result.data[0]


async def delete_cv(user_id: str, cv_id: str) -> bool:
    cv = await get_cv(user_id, cv_id)
    if not cv:
        return False
    _db().storage.from_(BUCKET).remove([cv["storage_path"]])
    _db().table("cvs").delete().eq("id", cv_id).eq("user_id", user_id).execute()
    return True
