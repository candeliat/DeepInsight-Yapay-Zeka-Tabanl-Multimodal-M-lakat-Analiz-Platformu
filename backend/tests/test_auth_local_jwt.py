"""
get_current_user'ın yerel (JWKS) JWT doğrulaması: geçerli ES256 token Supabase Auth'a
gitmeden kabul edilir; süresi dolmuş, başka anahtarla imzalanmış veya yanlış kitleye
verilmiş token 401 alır; yerelde karar verilemeyen token (simetrik algoritma, bilinmeyen
anahtar) Supabase Auth'a sorulur.
"""
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

import app.api.dependencies.auth as auth
from app.core.config import settings

SUPABASE_URL = "https://proje.supabase.co"
KID = "anahtar-1"


@pytest.fixture
def key(monkeypatch):
    private = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(settings, "SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(auth, "_jwks", {"keys": {KID: private.public_key()}, "fetched_at": time.monotonic()})
    fake = MagicMock()
    monkeypatch.setattr(auth, "supabase", fake)
    return private


def _token(private, kid=KID, **overrides):
    now = int(time.time())
    claims = {
        "sub": "u1", "email": "u1@x.com", "aud": "authenticated", "iss": f"{SUPABASE_URL}/auth/v1",
        "iat": now, "exp": now + 3600, "role": "authenticated",
        "user_metadata": {"first_name": "Ali"}, "app_metadata": {"role": "admin"},
    }
    claims.update(overrides)
    return jwt.encode(claims, private, algorithm="ES256", headers={"kid": kid})


def test_valid_token_is_verified_locally_without_network(key):
    user = asyncio.run(auth.get_current_user(_token(key)))
    assert (user.id, user.email) == ("u1", "u1@x.com")
    assert user.user_metadata == {"first_name": "Ali"} and user.app_metadata == {"role": "admin"}
    auth.supabase.auth.get_user.assert_not_called()


@pytest.mark.parametrize("overrides", [
    {"exp": int(time.time()) - 120},         # süresi dolmuş (saat payının dışında)
    {"aud": "anon"},                          # yanlış kitle
    {"iss": "https://baska.supabase.co/auth/v1"},  # başka proje
])
def test_invalid_claims_return_401(key, overrides):
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user(_token(key, **overrides)))
    assert info.value.status_code == 401
    auth.supabase.auth.get_user.assert_not_called()


def test_token_signed_with_other_key_returns_401(key):
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user(_token(other)))
    assert info.value.status_code == 401


def test_unknown_kid_refreshes_jwks_then_falls_back_to_supabase(key, monkeypatch):
    monkeypatch.setattr(auth, "_jwks", {"keys": {}, "fetched_at": 0.0})
    fetch = AsyncMock(side_effect=OSError("ağ yok"))
    monkeypatch.setattr(auth, "_fetch_jwks", fetch)
    remote = MagicMock(id="u1", email="u1@x.com", created_at="2026-01-01", user_metadata={}, app_metadata={})
    auth.supabase.auth.get_user.return_value = MagicMock(user=remote)
    user = asyncio.run(auth.get_current_user(_token(key, kid="yeni-anahtar")))
    assert user.id == "u1" and user.created_at == "2026-01-01"
    fetch.assert_awaited_once()
    auth.supabase.auth.get_user.assert_called_once()


def test_rotated_key_is_picked_up_from_jwks(key, monkeypatch):
    new_private = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "_jwks", {"keys": {}, "fetched_at": 0.0})

    async def fetch():
        auth._jwks["keys"], auth._jwks["fetched_at"] = {"yeni": new_private.public_key()}, time.monotonic()

    monkeypatch.setattr(auth, "_fetch_jwks", fetch)
    assert asyncio.run(auth.get_current_user(_token(new_private, kid="yeni"))).id == "u1"
    auth.supabase.auth.get_user.assert_not_called()


def test_symmetric_token_is_checked_by_supabase(key):
    hs = jwt.encode({"sub": "u1", "aud": "authenticated", "exp": int(time.time()) + 60}, "x" * 32, algorithm="HS256")
    auth.supabase.auth.get_user.return_value = MagicMock(user=None)
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user(hs))
    assert info.value.status_code == 401
    auth.supabase.auth.get_user.assert_called_once()


def test_fetch_user_profile_returns_fresh_record(key):
    remote = MagicMock(id="u1", email="u1@x.com", created_at="2026-01-01T10:00:00", user_metadata={"target": "QA"}, app_metadata={})
    auth.supabase.auth.admin.get_user_by_id.return_value = MagicMock(user=remote)
    profile = asyncio.run(auth.fetch_user_profile("u1"))
    assert profile.created_at == "2026-01-01T10:00:00" and profile.user_metadata == {"target": "QA"}


def test_token_issued_slightly_in_the_future_is_accepted(key):
    # Supabase'in saati birkaç saniye ileride olabilir: yeni yenilenmiş token reddedilmemeli.
    now = int(time.time())
    user = asyncio.run(auth.get_current_user(_token(key, iat=now + 20, nbf=now + 20)))
    assert user.id == "u1"


def test_invalid_token_message_is_turkish_and_hides_library_error(key):
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user(_token(other)))
    assert info.value.detail == "Oturum doğrulanamadı. Lütfen tekrar giriş yapın."
