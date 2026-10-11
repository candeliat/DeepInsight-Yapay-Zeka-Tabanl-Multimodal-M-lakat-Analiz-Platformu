"""
Faz 5 — pilot çalışma testleri (SUS, önce/sonra istatistikleri, kimliksizlik,
onam kontrolü). Gerçek Supabase çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_pilot.py -v
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import organization_service
from app.services import pilot_service as pilot


def _inv(i, user, score):
    return {"id": f"{user}-{i}", "user_id": user, "status": "completed", "topic": "React", "role": "FE",
            "technical_score": score, "confidence_score": score, "vocabulary_score": score,
            "created_at": f"2026-10-{i + 1:02d}T10:00:00+00:00"}


# --- SUS ---

def test_sus_score_extremes_and_known_example():
    assert pilot.sus_score([5, 1] * 5) == 100.0  # en iyi
    assert pilot.sus_score([1, 5] * 5) == 0.0    # en kötü
    assert pilot.sus_score([3] * 10) == 50.0     # nötr
    assert pilot.sus_score([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]) == 75.0


@pytest.mark.parametrize("answers", [[3] * 9, [0] + [3] * 9, [6] + [3] * 9])
def test_sus_rejects_invalid_answers(answers):
    with pytest.raises(ValueError):
        pilot.sus_score(answers)


def test_sus_grade_thresholds():
    assert pilot.sus_grade(85) == "Mükemmel" and pilot.sus_grade(70).startswith("İyi")
    assert pilot.sus_grade(55) == "Ortalamanın altı" and pilot.sus_grade(40) == "Zayıf" and pilot.sus_grade(None) is None


# --- istatistikler ---

def test_paired_stats_detects_consistent_improvement():
    pre, post = [50, 55, 60, 45, 52], [60, 62, 70, 55, 58]
    s = pilot.paired_stats(pre, post)
    assert s["n"] == 5 and s["improved"] == 5 and s["declined"] == 0
    assert s["mean_delta"] == 8.6 and s["p_ttest"] < 0.01 and s["cohens_dz"] > 2


def test_paired_stats_small_or_constant_samples_do_not_crash():
    assert pilot.paired_stats([50], [60])["t"] is None
    same = pilot.paired_stats([50, 60], [55, 65])  # tüm farklar eşit -> sd=0
    assert same["mean_delta"] == 5.0 and same["cohens_dz"] is None


# --- rapor ---

def test_report_is_pseudonymous_and_ordered_by_consent():
    participants = [{"user_id": "u-b", "granted_at": "2026-10-01"}, {"user_id": "u-a", "granted_at": "2026-10-02"}]
    interviews = [_inv(0, "u-b", 50), _inv(1, "u-b", 70), _inv(0, "u-a", 60)]
    surveys = [{"user_id": "u-b", "kind": "sus", "answers": [4, 2] * 5, "score": 75},
               {"user_id": "u-b", "kind": "post_interview", "answers": {"useful": 5, "realistic": 4, "feedback_clear": 3}, "score": 4}]
    report = pilot.build_report(participants, interviews, {}, surveys)

    assert [r["participant"] for r in report["rows"]] == ["P01", "P02"]
    p01, p02 = report["rows"]
    assert (p01["first"], p01["last"], p01["delta"], p01["sus"]) == (50.0, 70.0, 20.0, 75.0)
    assert p02["delta"] is None  # tek mülakat -> önce/sonra yok
    assert report["with_pre_post"] == 1 and report["sus"]["mean"] == 75.0
    assert report["post_interview"]["items"][0] == {"key": "useful", "label": pilot.POST_ITEMS["useful"], "mean": 5.0}
    assert "u-a" not in str(report) and "u-b" not in str(report)  # kimlik sızmaz


def test_first2_last2_needs_four_interviews():
    participants = [{"user_id": "u1", "granted_at": "x"}]
    interviews = [_inv(i, "u1", s) for i, s in enumerate([40, 50, 60, 80])]
    row = pilot.build_report(participants, interviews, {}, [])["rows"][0]
    assert (row["first2"], row["last2"]) == (45.0, 70.0)


def test_report_csv_has_no_identity_columns():
    report = pilot.build_report([{"user_id": "secret-user", "granted_at": "x"}], [_inv(0, "secret-user", 50), _inv(1, "secret-user", 60)], {}, [])
    text = pilot.report_csv(report)
    assert "secret-user" not in text and "P01" in text and "E-posta" not in text


# --- HTTP ---

ME = UserProfile(id="u1", email="u1@x.com", created_at="2026-01-01T00:00:00Z", user_metadata={}, app_metadata={})
ADMIN = UserProfile(id="root", email="r@x.com", created_at="2026-01-01T00:00:00Z", user_metadata={}, app_metadata={"role": "admin"})


@pytest.fixture
def login(monkeypatch):
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))

    def _as(user):
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _as
    app.dependency_overrides.clear()


def test_report_requires_platform_admin(login, monkeypatch):
    monkeypatch.setattr(pilot, "fetch_report", lambda: pilot.build_report([], [], {}, []))
    assert login(ME).get("/api/v1/pilot/report").status_code == 403
    assert login(ADMIN).get("/api/v1/pilot/report").status_code == 200


def test_survey_without_consent_is_forbidden(login, monkeypatch):
    monkeypatch.setattr(pilot, "has_consent", lambda uid: False)
    resp = login(ME).post("/api/v1/pilot/surveys/sus", json={"answers": [3] * 10})
    assert resp.status_code == 403


def test_post_interview_survey_validates_items(login, monkeypatch):
    monkeypatch.setattr(pilot, "has_consent", lambda uid: True)
    resp = login(ME).post("/api/v1/pilot/surveys/post-interview",
                          json={"interview_id": "i1", "answers": {"useful": 7, "realistic": 3, "feedback_clear": 3}})
    assert resp.status_code == 422


def test_withdrawing_consent_deletes_survey_answers(monkeypatch):
    fake = MagicMock()
    monkeypatch.setattr(pilot, "supabase", fake)
    assert pilot.set_consent("u1", False) is False
    tables = [c.args[0] for c in fake.table.call_args_list]
    assert tables[0] == "survey_responses"  # önce yanıtlar silinir
    fake.table.return_value.delete.return_value.eq.assert_any_call("user_id", "u1")
