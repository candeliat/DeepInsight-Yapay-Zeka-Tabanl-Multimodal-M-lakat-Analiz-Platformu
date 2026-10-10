"""
CV metin çıkarma, yükleme akışı, KVKK rızası ve sahiplik izolasyonu testleri.
Gerçek Supabase/OCR çağrısı yapılmaz (OCR ve veritabanı mock'lanır).

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_cv.py -v
"""
import io
from unittest.mock import AsyncMock, MagicMock

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import cv_service, cv_text_service, organization_service

CV_TEXT = (
    "Ayse Yilmaz\nayse@example.com\nEGITIM\nIstanbul Teknik Universitesi Bilgisayar Muhendisligi\n"
    "DENEYIM\nBackend Developer Stajyeri: FastAPI ve PostgreSQL ile REST API gelistirdim.\nBECERILER\nPython SQL Docker"
)


def _pdf(text=CV_TEXT):
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 72), text, fontsize=11)
    return doc.tobytes()


# --- cv_text_service ---

def test_detect_kind_uses_magic_bytes_not_extension():
    assert cv_text_service.detect_kind(_pdf())[0] == "pdf"
    assert cv_text_service.detect_kind(b"\x89PNG\r\n\x1a\n....")[0] == "image"
    assert cv_text_service.detect_kind(b"\xff\xd8\xff\xe0....")[0] == "image"


def test_detect_kind_rejects_unknown_and_fake_zip():
    with pytest.raises(cv_text_service.UnsupportedCVFile):
        cv_text_service.detect_kind(b"MZ\x90\x00 bu bir exe")
    buf = io.BytesIO()
    import zipfile
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("x.txt", "docx degil")
    with pytest.raises(cv_text_service.UnsupportedCVFile):
        cv_text_service.detect_kind(buf.getvalue())


def test_extract_text_layer_pdf_does_not_use_ocr(monkeypatch):
    ocr = MagicMock(side_effect=AssertionError("OCR çağrılmamalı"))
    monkeypatch.setattr(cv_text_service, "_ocr_image_bytes", ocr)
    text, method, mime, stats = cv_text_service.extract_cv_text(_pdf())
    assert method == "pdf_text" and "FastAPI" in text
    assert stats["has_text_layer"] is True and stats["page_count"] == 1


def test_extract_scanned_pdf_falls_back_to_ocr(monkeypatch):
    doc = pymupdf.open()
    page = doc.new_page()
    pix = pymupdf.open(stream=_pdf(), filetype="pdf")[0].get_pixmap(dpi=72)
    page.insert_image(page.rect, stream=pix.tobytes("png"))
    monkeypatch.setattr(cv_text_service, "_ocr_image_bytes", lambda b: CV_TEXT)

    text, method, _, stats = cv_text_service.extract_cv_text(doc.tobytes())

    assert method == "ocr" and stats["has_text_layer"] is False
    assert "FastAPI" in text


def test_extract_rejects_oversized_file():
    with pytest.raises(cv_text_service.UnsupportedCVFile):
        cv_text_service.extract_cv_text(b"%PDF-" + b"0" * (cv_text_service.MAX_CV_BYTES + 1))


# --- cv_service ---

class _Q:
    """Zincirleme sorguları kaydeden sahte sorgu."""
    def __init__(self, data=None, calls=None):
        self.data = data or []
        self.calls = calls if calls is not None else []

    def __getattr__(self, name):
        def _m(*a, **k):
            self.calls.append((name, a))
            return self
        return _m

    def execute(self):
        return self


def _fake_db(cv_rows=None, consent=True):
    fake = MagicMock()
    calls = []

    def _table(name):
        if name == "user_consents":
            return _Q([{"revoked_at": None}] if consent else [], calls)
        return _Q(cv_rows if cv_rows is not None else [], calls)

    fake.table.side_effect = _table
    fake.storage.list_buckets.return_value = [MagicMock(name="cvs")]
    fake.storage.list_buckets.return_value[0].name = "cvs"
    fake._calls = calls
    return fake


def test_get_cv_is_scoped_to_owner(monkeypatch):
    fake = _fake_db(cv_rows=[])
    monkeypatch.setattr(cv_service, "supabase", fake)
    import asyncio
    assert asyncio.run(cv_service.get_cv("user-a", "cv-of-user-b")) is None
    assert ("eq", ("user_id", "user-a")) in fake._calls


def test_create_cv_requires_consent(monkeypatch):
    monkeypatch.setattr(cv_service, "supabase", _fake_db(consent=False))
    import asyncio
    with pytest.raises(cv_service.ConsentRequired):
        asyncio.run(cv_service.create_cv("user-a", _pdf(), "cv.pdf"))


def test_create_cv_rejects_unreadable_text_and_stores_nothing(monkeypatch):
    fake = _fake_db()
    monkeypatch.setattr(cv_service, "supabase", fake)
    monkeypatch.setattr(cv_service.cv_text_service, "extract_cv_text", lambda d: ("  ", "ocr", "image/png", {}))
    import asyncio
    with pytest.raises(ValueError):
        asyncio.run(cv_service.create_cv("user-a", b"\x89PNG\r\n\x1a\n", "scan.png"))
    fake.storage.from_.assert_not_called()


# --- HTTP katmanı ---

@pytest.fixture
def api(monkeypatch):
    user = UserProfile(id="user-a", email="a@example.com", created_at="2026-01-01T00:00:00Z",
                       user_metadata={}, app_metadata={})
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_upload_without_consent_returns_403(api, monkeypatch):
    monkeypatch.setattr(cv_service, "create_cv", AsyncMock(side_effect=cv_service.ConsentRequired("rıza yok")))
    resp = api.post("/api/v1/cv", files={"file": ("cv.pdf", _pdf(), "application/pdf")})
    assert resp.status_code == 403


def test_upload_unsupported_file_returns_422(api, monkeypatch):
    monkeypatch.setattr(cv_service, "create_cv", AsyncMock(side_effect=ValueError("Desteklenmeyen dosya türü")))
    resp = api.post("/api/v1/cv", files={"file": ("x.exe", b"MZ....", "application/octet-stream")})
    assert resp.status_code == 422


def test_upload_for_org_requires_membership(api, monkeypatch):
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value=None))
    create = AsyncMock()
    monkeypatch.setattr(cv_service, "create_cv", create)
    resp = api.post("/api/v1/cv", data={"org_id": "org-b"}, files={"file": ("cv.pdf", _pdf(), "application/pdf")})
    assert resp.status_code == 403
    create.assert_not_awaited()


def test_get_other_users_cv_returns_404(api, monkeypatch):
    monkeypatch.setattr(cv_service, "get_cv", AsyncMock(return_value=None))
    assert api.get("/api/v1/cv/cv-of-user-b").status_code == 404
    monkeypatch.setattr(cv_service, "delete_cv", AsyncMock(return_value=False))
    assert api.delete("/api/v1/cv/cv-of-user-b").status_code == 404


def test_revoke_consent_reports_deleted_count(api, monkeypatch):
    monkeypatch.setattr(cv_service, "revoke_consent", AsyncMock(return_value=2))
    resp = api.delete("/api/v1/cv/consent")
    assert resp.status_code == 200 and resp.json()["deleted_cvs"] == 2
