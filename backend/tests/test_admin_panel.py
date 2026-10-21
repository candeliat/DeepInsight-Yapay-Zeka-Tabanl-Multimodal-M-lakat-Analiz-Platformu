"""
Platform admin paneli: yetki, platform geneli kullanım kırılımları ve yapay zekâ envanteri.
Gerçek Supabase/LLM çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_admin_panel.py -v
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import admin_service
from app.services.llm_service import llm_service
from app.services.org_usage_service import PURPOSES


def _row(purpose, model="m-a", org=None, user="u1", success=True, prompt=1000, completion=200):
    return {"purpose": purpose, "model": model, "org_id": org, "user_id": user, "success": success, "latency_ms": 5000,
            "prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": prompt + completion,
            "created_at": "2026-10-05T10:00:00+00:00", "interview_id": None}


@pytest.fixture
def as_role():
    def _login(role):
        user = UserProfile(id="x", email="x@example.com", created_at="2026-01-01T00:00:00Z", user_metadata={},
                           app_metadata={"role": role} if role else {})
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)
    yield _login
    app.dependency_overrides.clear()


def test_non_admin_gets_403_on_every_admin_endpoint(as_role):
    c = as_role(None)
    for path in ("/api/v1/admin/overview", "/api/v1/admin/ai-usage", "/api/v1/admin/ai-inventory"):
        assert c.get(path).status_code == 403


def test_summarize_platform_by_feature_and_org():
    rows = [
        _row("question_stream"), _row("question"), _row("evaluation", org="org-a", user="u2"),
        _row("cover_letter", model="m-b", success=False, prompt=0, completion=0), _row("yeni_amac"),
    ]
    out = admin_service.summarize_platform(rows, [], {"org-a": "Ege Kariyer"}, {"m-a": {"input": 1.0, "output": 1.0}})
    features = {f["feature"]: f for f in out["by_feature"]}
    assert features["Mülakat: soru üretimi"]["calls"] == 2  # akışlı + akışsız tek özellikte
    assert features["Mülakat: soru üretimi"]["purposes"] == ["question", "question_stream"]
    assert features["Ön yazı"]["failed"] == 1
    assert "yeni_amac" in features  # bilinmeyen purpose ham adıyla görünür
    orgs = {o["name"]: o for o in out["by_org"]}
    assert orgs["Bireysel / kişisel"]["calls"] == 4 and orgs["Ege Kariyer"]["users"] == 1
    assert orgs["Ege Kariyer"]["estimated_cost_usd"] == 0.0012
    assert out["active_users"] == 2 and out["calls"] == 5 and out["failed_calls"] == 1


def test_every_known_purpose_has_feature_and_where():
    assert all(meta.get("feature") and meta.get("where") for meta in PURPOSES.values())
    # LLM servisinde kullanılan her purpose envanterde olmalı.
    import pathlib, re
    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    used = set()
    for path in root.rglob("*.py"):
        used |= set(re.findall(r'purpose="([a-z_]+)"', path.read_text(encoding="utf-8")))
    assert used <= set(PURPOSES), used - set(PURPOSES)


def test_inventory_lists_chain_with_live_breaker_state(as_role, monkeypatch):
    monkeypatch.setattr(llm_service._breaker, "_open_until", {llm_service.FREE_MODELS[0]: 10**12})
    data = as_role("admin").get("/api/v1/admin/ai-inventory").json()
    chain = data["llm"]["chain"]
    assert [c["model"] for c in chain] == llm_service.FREE_MODELS
    assert chain[0]["circuit_open"] is True and chain[1]["circuit_open"] is False
    assert all(c["json_mode"] == (c["model"] not in llm_service.JSON_MODE_UNSUPPORTED) for c in chain)
    ids = {c["id"] for c in data["components"]}
    assert {"embedding_api", "embedding_local", "whisper", "ocr", "face", "rules"} <= ids
    assert {p["purpose"] for p in data["llm"]["purposes"]} == set(PURPOSES)


def test_ai_usage_endpoint_month_validation_and_503(as_role, monkeypatch):
    usage = AsyncMock(return_value={"month": "2026-09", "calls": 0})
    monkeypatch.setattr(admin_service, "ai_usage", usage)
    c = as_role("admin")
    assert c.get("/api/v1/admin/ai-usage?month=2026-09").json()["month"] == "2026-09"
    assert usage.await_args.args[0] == "2026-09"
    assert c.get("/api/v1/admin/ai-usage?month=eylul").status_code == 422
    monkeypatch.setattr(admin_service, "ai_usage", AsyncMock(side_effect=RuntimeError("db")))
    assert c.get("/api/v1/admin/ai-usage").status_code == 503


def test_overview_endpoint(as_role, monkeypatch):
    monkeypatch.setattr(admin_service, "overview", AsyncMock(return_value={"users": 18, "organizations": 1}))
    assert as_role("admin").get("/api/v1/admin/overview").json()["users"] == 18


def test_summarize_platform_error_types_and_last_times():
    rows = [
        {**_row("evaluation"), "created_at": "2026-10-05T10:00:00+00:00"},
        {**_row("evaluation", success=False), "error_type": "TimeoutError", "created_at": "2026-10-06T09:00:00+00:00"},
        {**_row("cover_letter", model="m-b", success=False), "error_type": "TimeoutError", "created_at": "2026-10-04T08:00:00+00:00"},
        {**_row("cv_profile", success=False), "error_type": None, "created_at": "2026-10-03T08:00:00+00:00"},
    ]
    out = admin_service.summarize_platform(rows, [], {}, {})
    assert [(e["error_type"], e["count"]) for e in out["errors"]] == [("TimeoutError", 2), ("Bilinmeyen", 1)]
    timeout = out["errors"][0]
    assert {f["feature"] for f in timeout["features"]} == {"Mülakat sonu değerlendirme", "Ön yazı"}
    assert {m["model"] for m in timeout["models"]} == {"m-a", "m-b"}
    ev = next(f for f in out["by_feature"] if f["feature"] == "Mülakat sonu değerlendirme")
    assert ev["last_success_at"] == "2026-10-05T10:00:00+00:00"
    assert ev["last_failure_at"] == "2026-10-06T09:00:00+00:00" and ev["last_error_type"] == "TimeoutError"
    assert out["last_success_at"] == "2026-10-05T10:00:00+00:00"
    assert out["last_failure_at"] == "2026-10-06T09:00:00+00:00"


def test_parse_range_inclusive_tr_days_and_validation():
    lo, hi, label = admin_service.parse_range(None, "2026-10-01", "2026-10-21")
    assert lo.isoformat() == "2026-09-30T21:00:00+00:00"  # TR gece yarısı
    assert hi.isoformat() == "2026-10-21T21:00:00+00:00"  # bitiş günü dahil
    assert label == "2026-10-01 – 2026-10-21"
    assert admin_service.parse_range("2026-09", None, None)[2] == "2026-09"
    for bad in (("2026-10-01", None), ("2026-10-21", "2026-10-01"), ("2025-01-01", "2026-10-01"), ("2026-02-30", "2026-03-01")):
        with pytest.raises(ValueError):
            admin_service.parse_range(None, *bad)


def test_ai_usage_endpoint_passes_date_range(as_role, monkeypatch):
    usage = AsyncMock(return_value={"month": "x"})
    monkeypatch.setattr(admin_service, "ai_usage", usage)
    c = as_role("admin")
    assert c.get("/api/v1/admin/ai-usage?start=2026-10-01&end=2026-10-21").status_code == 200
    assert usage.await_args.args == (None, "2026-10-01", "2026-10-21")
    assert c.get("/api/v1/admin/ai-usage?start=1-10-2026&end=2026-10-21").status_code == 422
    # Mantık hatası (bitiş < başlangıç) serviste ValueError -> 422
    monkeypatch.setattr(admin_service, "ai_usage", AsyncMock(side_effect=ValueError("Bitiş tarihi başlangıçtan önce olamaz.")))
    r = c.get("/api/v1/admin/ai-usage?start=2026-10-21&end=2026-10-01")
    assert r.status_code == 422 and "Bitiş" in r.json()["detail"]


def test_inventory_purposes_have_timeouts(as_role):
    from app.core.config import settings
    purposes = {p["purpose"]: p for p in as_role("admin").get("/api/v1/admin/ai-inventory").json()["llm"]["purposes"]}
    assert purposes["cover_letter"]["timeout_s"] == 110
    assert purposes["evaluation"]["timeout_s"] == settings.LLM_JSON_ATTEMPT_MAX_DURATION
    assert purposes["question_stream"]["timeout_s"] == settings.LLM_ATTEMPT_MAX_DURATION
