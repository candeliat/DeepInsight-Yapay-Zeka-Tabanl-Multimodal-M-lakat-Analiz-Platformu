"""
Faz 3 — gelişim raporu testleri: zaman serisi, özgüven kaynağı, eğilim, konu
gruplama, deterministik öneriler, PDF içeriği ve uç noktalar.
Gerçek Supabase çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_progress.py -v
"""
from unittest.mock import MagicMock

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import progress_report, progress_service


def _inv(i, tech, conf, vocab, topic="React", difficulty="ORTA", role="Frontend"):
    return {"id": f"i{i}", "role": role, "topic": topic, "difficulty": difficulty, "status": "completed",
            "technical_score": tech, "confidence_score": conf, "vocabulary_score": vocab,
            "created_at": f"2026-09-{i:02d}T10:00:00Z"}


def test_empty_progress():
    p = progress_service.build_progress([], {})
    assert p["completed_count"] == 0 and p["timeline"] == [] and p["recommendations"] == []


def test_timeline_is_chronological_and_skips_unscored():
    invs = [_inv(3, 70, 70, 70), _inv(1, 50, 50, 50), _inv(2, None, None, None)]
    t = progress_service.build_timeline(invs, {})
    assert [p["id"] for p in t] == ["i1", "i3"]
    assert t[0]["average"] == 50


def test_objective_video_confidence_overrides_text_estimate():
    t = progress_service.build_timeline([_inv(1, 80, 40, 60)], {"i1": {"confidence_pct": 90, "eye_contact_pct": 70}})
    assert t[0]["confidence"] == 90 and t[0]["confidence_source"] == "video"
    assert t[0]["average"] == round((80 + 90 + 60) / 3, 1)


def test_trend_compares_last_five_with_previous_five():
    invs = [_inv(i, 80, 80, 80) for i in range(1, 6)] + [_inv(i, 60, 60, 60) for i in range(6, 11)]
    p = progress_service.build_progress(invs, {})
    assert p["trend"]["average"] == {"recent": 60.0, "previous": 80.0, "delta": -20.0}
    assert any(r["id"] == "trend:down" for r in p["recommendations"])


def test_topics_group_case_and_turkish_variants_and_flag_weak():
    invs = [_inv(1, 40, 40, 40, topic="Veri Yapıları"), _inv(2, 50, 50, 50, topic="veri yapilari"),
            _inv(3, 90, 90, 90, topic="React")]
    p = progress_service.build_progress(invs, {})
    topics = {t["topic"]: t for t in p["topics"]}
    assert len(p["topics"]) == 2
    weak = p["topics"][0]
    assert weak["count"] == 2 and weak["average"] == 45 and weak["weak"] is True
    assert topics["React"]["weak"] is False
    rec = next(r for r in p["recommendations"] if r["id"].startswith("topic:"))
    assert rec["action"]["topic"] == weak["topic"]


def test_weakest_metric_recommendation():
    p = progress_service.build_progress([_inv(1, 85, 80, 55)], {})
    assert p["weakest"] == "vocabulary" and p["strongest"] == "technical"
    assert any(r["id"] == "metric:vocabulary" for r in p["recommendations"])


def test_level_up_after_three_strong_interviews():
    invs = [_inv(i, 85, 85, 85, difficulty="JUNIOR") for i in range(1, 4)]
    rec = next(r for r in progress_service.build_progress(invs, {})["recommendations"] if r["id"] == "level:up")
    assert rec["action"]["difficulty"] == "ORTA"


def test_no_level_up_beyond_expert():
    invs = [_inv(i, 90, 90, 90, difficulty="UZMAN") for i in range(1, 4)]
    assert not any(r["id"] == "level:up" for r in progress_service.build_progress(invs, {})["recommendations"])


def test_video_tips_use_thresholds():
    invs = [_inv(1, 80, 80, 80)]
    analytics = {"i1": {"eye_contact_pct": 30, "filler_word_count": 15, "speech_rate_wpm": 190}}
    ids = {r["id"] for r in progress_service.build_progress(invs, analytics)["recommendations"]}
    assert {"video:eye", "video:filler", "video:rate"} <= ids
    good = {"i1": {"eye_contact_pct": 80, "filler_word_count": 2, "speech_rate_wpm": 130}}
    assert not any(r["id"].startswith("video:") for r in progress_service.build_progress(invs, good)["recommendations"])


def test_fetch_user_data_is_owner_scoped(monkeypatch):
    fake = MagicMock()
    q = MagicMock()
    for m in ("select", "eq", "order", "in_"):
        getattr(q, m).return_value = q
    q.execute.return_value = MagicMock(data=[])
    fake.table.return_value = q
    monkeypatch.setattr(progress_service, "supabase", fake)
    progress_service.fetch_user_data("user-a")
    q.eq.assert_any_call("user_id", "user-a")
    q.eq.assert_any_call("status", "completed")


# --- PDF ---

def _pdf_text(pdf_bytes):
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    return doc.page_count, "\n".join(page.get_text() for page in doc)


def test_pdf_contains_turkish_text_and_escapes_html():
    invs = [_inv(i, 60 + i, 70, 75, topic="Ağ Güvenliği <b>XSS</b>") for i in range(1, 8)]
    pdf = progress_report.build_progress_pdf(progress_service.build_progress(invs, {}), "Ayşe Işık")
    pages, text = _pdf_text(pdf)
    assert pages == 2
    assert "Gelişim Raporu" in text and "Ayşe Işık" in text
    assert "<b>XSS</b>" in text  # etiket olarak yorumlanmadı, düz metin kaldı


def test_pdf_for_user_without_interviews():
    pages, text = _pdf_text(progress_report.build_progress_pdf(progress_service.build_progress([], {}), "Test"))
    assert pages == 1 and "Henüz tamamlanmış mülakat yok" in text


# --- HTTP ---

@pytest.fixture
def api():
    user = UserProfile(id="user-a", email="a@example.com", created_at="2026-01-01T00:00:00Z",
                       user_metadata={"first_name": "Test"}, app_metadata={})
    app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
    app.dependency_overrides[get_current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_progress_endpoint_uses_current_user(api, monkeypatch):
    calls = []
    monkeypatch.setattr(progress_service, "get_user_progress", lambda uid: calls.append(uid) or {"completed_count": 0})
    assert api.get("/api/v1/progress/me").json() == {"completed_count": 0}
    assert calls == ["user-a"]


def test_report_endpoint_returns_pdf(api, monkeypatch):
    monkeypatch.setattr(progress_service, "get_user_progress",
                        lambda uid: progress_service.build_progress([_inv(1, 70, 70, 70)], {}))
    resp = api.get("/api/v1/progress/me/report.pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


def test_pdf_chart_legend_renders_turkish_letters():
    invs = [_inv(i, 60 + i, 70, 75) for i in range(1, 6)]
    pdf = progress_report.build_progress_pdf(progress_service.build_progress(invs, {}), "Test")
    page = pymupdf.open(stream=pdf, filetype="pdf")[0]
    legend = page.get_text(clip=pymupdf.Rect(40, 358, 560, 382))
    assert "İletişim ve kelime" in legend  # temel yazı tipiyle "·leti·im" olarak bozuluyordu
