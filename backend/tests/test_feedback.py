"""
Geri bildirim (hata bildirimi / özellik önerisi): ekran görüntüsü doğrulama ve depolama,
kullanıcı ve admin uç noktaları, yetki. Gerçek Supabase çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_feedback.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import feedback_service as fb
from app.services import organization_service

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 32


class _FakeDB:
    def __init__(self, insert_ok=True, rows=None):
        self.inserted, self.uploaded, self.removed, self.updates, self.filters = [], [], [], [], []
        self.insert_ok, self.rows = insert_ok, rows or []
        storage = MagicMock()
        storage.list_buckets = AsyncMock(return_value=[MagicMock(name_="x")])
        storage.create_bucket = AsyncMock()
        bucket = MagicMock()
        bucket.upload = AsyncMock(side_effect=lambda path, data, opts: self.uploaded.append((path, opts)))
        bucket.remove = AsyncMock(side_effect=lambda paths: self.removed.extend(paths))
        bucket.create_signed_urls = AsyncMock(side_effect=lambda paths, ttl: [{"path": p, "signedURL": f"https://s/{p}"} for p in paths])
        storage.from_ = lambda name: bucket
        self.storage = storage

    def table(self, name):
        db = self

        class _Q:
            op = None

            def insert(self, record):
                self.op, self.record = "insert", record
                db.inserted.append(record)
                return self

            def update(self, values):
                self.op = "update"
                db.updates.append(values)
                return self

            def delete(self):
                self.op = "delete"
                return self

            def __getattr__(self, attr):
                def f(*a, **k):
                    db.filters.append((name, attr, a))
                    return self
                return f

            def execute(self):
                if self.op == "insert":
                    if not db.insert_ok:
                        raise RuntimeError("db")
                    return MagicMock(data=[{**self.record, "id": "fb-1", "status": "new"}])
                if self.op == "update":
                    return MagicMock(data=[{"id": "fb-1", "status": db.updates[-1].get("status", "new"), "admin_note": db.updates[-1].get("admin_note")}])
                if name == "profiles":
                    return MagicMock(data=[{"id": "u1", "email": "ece@example.com", "first_name": "Ece", "last_name": "Deneme"}])
                return MagicMock(data=db.rows)

        return _Q()


@pytest.fixture
def db(monkeypatch):
    fake = _FakeDB()
    monkeypatch.setattr(fb, "supabase", fake)
    monkeypatch.setattr(fb, "_bucket_ready", True)
    return fake


# --- ekran görüntüsü ---

@pytest.mark.parametrize("data,expected", [(PNG, "png"), (JPG, "jpg"), (WEBP, "webp"), (b"%PDF-1.4", None), (b"GIF89a", None)])
def test_image_type_by_magic_bytes(data, expected):
    assert fb.image_type(data) == expected


def test_create_with_screenshot_uploads_under_user_folder(db):
    out = asyncio.run(fb.create_feedback("u1", "bug", "  Buton   çalışmıyor ", "Adımlar...", "/jobs", "web", "UA", PNG))
    path, opts = db.uploaded[0]
    assert path.startswith("u1/") and path.endswith(".png") and opts == {"content-type": "image/png"}
    rec = db.inserted[0]
    assert rec["title"] == "Buton çalışmıyor" and rec["screenshot_path"] == path and rec["platform"] == "web"
    assert out["id"] == "fb-1"


def test_rejects_non_image_and_oversized_screenshot(db):
    with pytest.raises(fb.InvalidScreenshot):
        asyncio.run(fb.create_feedback("u1", "bug", "Başlık", "Açıklama", screenshot=b"%PDF-1.4 bad"))
    with pytest.raises(fb.InvalidScreenshot):
        asyncio.run(fb.create_feedback("u1", "bug", "Başlık", "Açıklama", screenshot=PNG + b"\x00" * fb.MAX_SCREENSHOT_BYTES))
    assert db.uploaded == [] and db.inserted == []


def test_failed_insert_removes_uploaded_screenshot(monkeypatch):
    fake = _FakeDB(insert_ok=False)
    monkeypatch.setattr(fb, "supabase", fake)
    monkeypatch.setattr(fb, "_bucket_ready", True)
    with pytest.raises(RuntimeError):
        asyncio.run(fb.create_feedback("u1", "feature", "Öneri", "Açıklama", screenshot=JPG))
    assert fake.removed == [fake.uploaded[0][0]]  # yetim dosya kalmaz


def test_unknown_platform_is_dropped(db):
    asyncio.run(fb.create_feedback("u1", "feature", "Öneri", "Açıklama", platform="desktop"))
    assert db.inserted[0]["platform"] is None and db.inserted[0]["screenshot_path"] is None


# --- admin listesi ve güncelleme ---

def test_admin_list_adds_sender_and_signed_url(monkeypatch):
    rows = [{"id": "fb-1", "user_id": "u1", "kind": "bug", "title": "X", "screenshot_path": "u1/a.png", "status": "new"},
            {"id": "fb-2", "user_id": None, "kind": "feature", "title": "Y", "screenshot_path": None, "status": "new"}]
    fake = _FakeDB(rows=rows)
    monkeypatch.setattr(fb, "supabase", fake)
    out = asyncio.run(fb.list_all(kind="bug"))
    assert out[0]["user_name"] == "Ece Deneme" and out[0]["user_email"] == "ece@example.com"
    assert out[0]["screenshot_url"] == "https://s/u1/a.png" and "screenshot_path" not in out[0]
    assert out[1]["user_email"] is None and out[1]["has_screenshot"] is False
    assert ("feedback", "eq", ("kind", "bug")) in fake.filters


def test_update_validates_status_and_audits(db, monkeypatch):
    audit = AsyncMock(return_value=None)
    monkeypatch.setattr(organization_service, "log_audit", audit)
    out = asyncio.run(fb.update("admin1", "fb-1", "resolved", "Düzeltildi #26"))
    assert out["status"] == "resolved" and db.updates[0]["admin_note"] == "Düzeltildi #26"
    assert audit.await_args.args[2] == "feedback.update"
    with pytest.raises(ValueError):
        asyncio.run(fb.update("admin1", "fb-1", "bitti", None))


def test_delete_for_user_removes_screenshots(monkeypatch):
    fake = _FakeDB(rows=[{"id": "a", "screenshot_path": "u1/a.png"}, {"id": "b", "screenshot_path": None}])
    monkeypatch.setattr(fb, "supabase", fake)
    assert asyncio.run(fb.delete_for_user("u1")) == 2
    assert fake.removed == ["u1/a.png"] and ("feedback", "eq", ("user_id", "u1")) in fake.filters


# --- HTTP ---

@pytest.fixture
def as_role():
    def _login(role=None, uid="u1"):
        user = UserProfile(id=uid, email=f"{uid}@example.com", created_at="2026-01-01T00:00:00Z", user_metadata={},
                           app_metadata={"role": role} if role else {})
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)
    yield _login
    app.dependency_overrides.clear()


def test_send_feedback_multipart(as_role, monkeypatch):
    create = AsyncMock(return_value={"id": "fb-1", "status": "new"})
    monkeypatch.setattr(fb, "create_feedback", create)
    resp = as_role().post("/api/v1/feedback", data={"kind": "bug", "title": "Buton", "description": "Tıklayınca olmuyor",
                                                    "page": "/jobs", "platform": "web"},
                          files={"screenshot": ("ss.png", PNG, "image/png")})
    assert resp.status_code == 200 and resp.json() == {"id": "fb-1", "status": "new"}
    args = create.await_args.args
    assert args[0] == "u1" and args[1] == "bug" and args[4] == "/jobs" and args[7] == PNG


def test_send_feedback_validation(as_role, monkeypatch):
    monkeypatch.setattr(fb, "create_feedback", AsyncMock(side_effect=fb.InvalidScreenshot("PNG, JPG ya da WEBP")))
    c = as_role()
    assert c.post("/api/v1/feedback", data={"kind": "övgü", "title": "Başlık", "description": "Açıklama"}).status_code == 422
    assert c.post("/api/v1/feedback", data={"kind": "bug", "title": "x", "description": "Açıklama"}).status_code == 422
    resp = c.post("/api/v1/feedback", data={"kind": "bug", "title": "Başlık", "description": "Açıklama"},
                  files={"screenshot": ("a.pdf", b"%PDF", "application/pdf")})
    assert resp.status_code == 422 and "PNG" in resp.json()["detail"]


def test_admin_endpoints_require_admin(as_role, monkeypatch):
    monkeypatch.setattr(fb, "list_all", AsyncMock(return_value=[]))
    assert as_role().get("/api/v1/admin/feedback").status_code == 403
    assert as_role().patch("/api/v1/admin/feedback/fb-1", json={"status": "resolved"}).status_code == 403
    assert as_role("admin").get("/api/v1/admin/feedback?kind=bug&status=new").status_code == 200
    assert fb.list_all.await_args.args == ("bug", "new")


def test_admin_update_404_and_invalid_status(as_role, monkeypatch):
    monkeypatch.setattr(fb, "update", AsyncMock(return_value=None))
    c = as_role("admin")
    assert c.patch("/api/v1/admin/feedback/yok", json={"status": "resolved"}).status_code == 404
    assert c.patch("/api/v1/admin/feedback/fb-1", json={"status": "bitti"}).status_code == 422


def test_my_feedback(as_role, monkeypatch):
    monkeypatch.setattr(fb, "list_mine", AsyncMock(return_value=[{"id": "fb-1", "status": "planned"}]))
    assert as_role().get("/api/v1/feedback/me").json()[0]["status"] == "planned"
