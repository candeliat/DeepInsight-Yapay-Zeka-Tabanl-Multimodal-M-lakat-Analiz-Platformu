"""
Kullanıcı başına istek sınırı (yapay zekâ/ağır uç noktalar) ve sızdırılmış şifre kontrolü
(HaveIBeenPwned k-anonimlik). Ağa çıkılmaz: HIBP yanıtı httpx.MockTransport ile taklit edilir.
"""
import asyncio
import hashlib
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

import app.api.routes.auth as auth_route
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.core import rate_limit
from app.core.config import settings
from app.core.rate_limit import SlidingWindowLimiter
from app.main import app
from app.services import password_breach


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


# --- sınırlayıcı ---

def test_limiter_blocks_after_limit_and_reports_when_to_retry():
    clock = Clock()
    limiter = SlidingWindowLimiter([(3, 60.0)], clock=clock)
    for t in (0, 10, 20):
        clock.now = t
        assert limiter.hit("u") is None
    clock.now = 30
    assert limiter.hit("u") == pytest.approx(30)  # ilk istek 60. saniyede pencereden çıkar
    clock.now = 60
    assert limiter.hit("u") is None
    assert limiter.hit("baska-kullanici") is None  # kullanıcılar birbirini etkilemez


def test_rejected_requests_do_not_extend_the_block():
    clock = Clock()
    limiter = SlidingWindowLimiter([(1, 60.0)], clock=clock)
    limiter.hit("u")
    for t in range(1, 59, 5):
        clock.now = t
        assert limiter.hit("u") is not None
    clock.now = 60
    assert limiter.hit("u") is None


def test_hourly_window_applies_even_when_minute_window_is_free():
    clock = Clock()
    limiter = SlidingWindowLimiter([(10, 60.0), (3, 3600.0)], clock=clock)
    for t in (0, 100, 200):
        clock.now = t
        assert limiter.hit("u") is None
    clock.now = 300
    assert limiter.hit("u") == pytest.approx(3300)


@pytest.fixture
def client(monkeypatch):
    me = UserProfile(id="user-1", email="u@example.com", created_at="2026-01-01", user_metadata={}, app_metadata={})
    app.dependency_overrides[oauth2_scheme] = lambda: "t"
    app.dependency_overrides[get_current_user] = lambda: me
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_heavy_endpoint_returns_429_in_turkish_with_retry_after(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "_llm_limiter", SlidingWindowLimiter([(1, 60.0)]))
    monkeypatch.setattr("app.api.routes.cv.cv_analysis_service.analyze_cv", AsyncMock(side_effect=ValueError("CV bulunamadı")))

    first = client.post("/api/v1/cv/cv-1/analyze")
    second = client.post("/api/v1/cv/cv-1/analyze")
    assert first.status_code != 429
    assert second.status_code == 429
    assert "çok fazla istek" in second.json()["detail"] and int(second.headers["Retry-After"]) >= 1


def test_listing_endpoints_are_not_rate_limited(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "_llm_limiter", SlidingWindowLimiter([(1, 60.0)]))
    monkeypatch.setattr("app.api.routes.cv.cv_service.list_cvs", AsyncMock(return_value=[]))
    assert [client.get("/api/v1/cv").status_code for _ in range(3)] == [200, 200, 200]


# --- sızdırılmış şifre ---

PASSWORD = "Parola-1234"
DIGEST = hashlib.sha1(PASSWORD.encode()).hexdigest().upper()


def _hibp(monkeypatch, body: str = "", status: int = 200, error: Exception | None = None):
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        if error:
            raise error
        return httpx.Response(status, text=body)

    real = httpx.AsyncClient
    monkeypatch.setattr(password_breach.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(settings, "PASSWORD_BREACH_CHECK", True)
    return seen


def test_only_the_hash_prefix_leaves_the_server_and_match_is_found_locally(monkeypatch):
    seen = _hibp(monkeypatch, body=f"0000000000000000000000000000000000A:0\n{DIGEST[5:]}:1234\n")
    assert asyncio.run(password_breach.times_breached(PASSWORD)) == 1234
    request = seen[0]
    assert request.url.path == f"/range/{DIGEST[:5]}" and request.headers["Add-Padding"] == "true"
    assert PASSWORD not in str(request.url) and DIGEST[5:] not in str(request.url)


def test_padding_lines_with_zero_count_are_not_matches(monkeypatch):
    _hibp(monkeypatch, body=f"{DIGEST[5:]}:0\n")
    assert asyncio.run(password_breach.is_breached(PASSWORD)) is False


def test_unreachable_service_does_not_block(monkeypatch):
    _hibp(monkeypatch, error=httpx.ConnectTimeout("yok"))
    assert asyncio.run(password_breach.times_breached(PASSWORD)) is None
    assert asyncio.run(password_breach.is_breached(PASSWORD)) is False


def test_register_rejects_breached_password_before_creating_account(client, monkeypatch):
    _hibp(monkeypatch, body=f"{DIGEST[5:]}:99\n")
    monkeypatch.setattr(auth_route, "supabase", MagicMock())
    created = MagicMock()
    monkeypatch.setattr("supabase.create_client", created)
    resp = client.post("/api/v1/auth/register", json={"email": "a@b.co", "password": PASSWORD, "privacy_accepted": True})
    assert resp.status_code == 422 and "sızıntı" in resp.json()["detail"]
    created.assert_not_called()


def test_change_password_rejects_breached_new_password(client, monkeypatch):
    _hibp(monkeypatch, body=f"{DIGEST[5:]}:5\n")
    fake = MagicMock()
    fake.auth.admin.update_user_by_id = AsyncMock()
    monkeypatch.setattr(auth_route, "supabase", fake)
    monkeypatch.setattr("supabase.create_client", MagicMock())  # mevcut şifre doğrulaması geçer
    resp = client.post("/api/v1/auth/change-password", json={"current_password": "Eski-sifre-1", "new_password": PASSWORD})
    assert resp.status_code == 422
    fake.auth.admin.update_user_by_id.assert_not_called()


def test_retry_after_header_is_readable_by_browsers(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "_llm_limiter", SlidingWindowLimiter([(1, 60.0)]))
    monkeypatch.setattr("app.api.routes.cv.cv_analysis_service.analyze_cv", AsyncMock(side_effect=ValueError("CV bulunamadı")))
    origin = {"Origin": "http://localhost:3002"}
    client.post("/api/v1/cv/cv-1/analyze", headers=origin)
    resp = client.post("/api/v1/cv/cv-1/analyze", headers=origin)
    assert resp.status_code == 429
    assert "retry-after" in resp.headers.get("access-control-expose-headers", "").lower()
