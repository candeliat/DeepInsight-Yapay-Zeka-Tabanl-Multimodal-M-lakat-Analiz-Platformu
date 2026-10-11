"""
get_current_user: gerçekten geçersiz token -> 401; Supabase'e ulaşılamaması
(ağ hatası/zaman aşımı) -> 503. 401 istemciyi oturumdan attığı için geçici
ağ sorunları 401 olarak raporlanmamalı.
"""
import asyncio
import ssl
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import HTTPException
from supabase_auth.errors import AuthApiError

import app.api.dependencies.auth as auth


def _supabase_raising(exc):
    fake = MagicMock()
    fake.auth.get_user.side_effect = exc
    return fake


@pytest.mark.parametrize("exc", [
    httpx.ReadTimeout("The read operation timed out"),
    httpx.ConnectError("connection refused"),
    TimeoutError("timed out"),
    ssl.SSLError("The read operation timed out"),
])
def test_network_failures_return_503_not_401(monkeypatch, exc):
    monkeypatch.setattr(auth, "supabase", _supabase_raising(exc))
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user("token"))
    assert info.value.status_code == 503


def test_invalid_token_returns_401(monkeypatch):
    monkeypatch.setattr(auth, "supabase", _supabase_raising(AuthApiError("invalid JWT", 401, "bad_jwt")))
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user("token"))
    assert info.value.status_code == 401


def test_missing_user_returns_401(monkeypatch):
    fake = MagicMock()
    fake.auth.get_user.return_value = MagicMock(user=None)
    monkeypatch.setattr(auth, "supabase", fake)
    with pytest.raises(HTTPException) as info:
        asyncio.run(auth.get_current_user("token"))
    assert info.value.status_code == 401


def test_transient_error_is_retried_once(monkeypatch):
    fake = MagicMock()
    user = MagicMock(id="u1", email="u@x.com", created_at="2026-01-01", user_metadata={}, app_metadata={})
    fake.auth.get_user.side_effect = [httpx.ReadError("connection reset"), MagicMock(user=user)]
    monkeypatch.setattr(auth, "supabase", fake)
    assert asyncio.run(auth.get_current_user("token")).id == "u1"
    assert fake.auth.get_user.call_count == 2
