"""
get_current_user: gerçekten geçersiz token -> 401; Supabase'e ulaşılamaması
(ağ hatası/zaman aşımı) -> 503. 401 istemciyi oturumdan attığı için geçici
ağ sorunları 401 olarak raporlanmamalı.
"""
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
        auth.get_current_user("token")
    assert info.value.status_code == 503


def test_invalid_token_returns_401(monkeypatch):
    monkeypatch.setattr(auth, "supabase", _supabase_raising(AuthApiError("invalid JWT", 401, "bad_jwt")))
    with pytest.raises(HTTPException) as info:
        auth.get_current_user("token")
    assert info.value.status_code == 401


def test_missing_user_returns_401(monkeypatch):
    fake = MagicMock()
    fake.auth.get_user.return_value = MagicMock(user=None)
    monkeypatch.setattr(auth, "supabase", fake)
    with pytest.raises(HTTPException) as info:
        auth.get_current_user("token")
    assert info.value.status_code == 401
