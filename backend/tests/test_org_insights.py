"""
Faz 4A — kurum paneli içgörüleri ve gizlilik kuralları:
  - toplu istatistikler en az MIN_COHORT öğrenci katkısıyla gösterilir,
  - öğrenci skoru yalnızca paylaşım rızasıyla görünür,
  - yalnızca kurum bağlamındaki mülakatlar sayılır,
  - rıza anahtarını yalnızca öğrencinin kendisi değiştirir.
Gerçek Supabase çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_org_insights.py -v
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import org_insights_service as insights
from app.services import organization_service, progress_service

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
ORG = {"id": "org-a", "name": "Ege Kariyer", "monthly_interview_quota": 100}


def _inv(i, user, avg, day="2026-10-05"):
    return {"id": f"i{i}", "user_id": user, "role": "Dev", "topic": "React", "difficulty": "ORTA", "status": "completed",
            "technical_score": avg, "confidence_score": avg, "vocabulary_score": avg, "created_at": f"{day}T10:00:00+00:00"}


def _members(*specs):
    return [{"user_id": u, "role": r, "share_progress": s, "created_at": "2026-09-01"} for u, r, s in specs]


MEMBERS = _members(("teacher", "instructor", False), ("s1", "candidate", True), ("s2", "candidate", False), ("s3", "candidate", False))


# --- toplu istatistik eşiği ---

def test_aggregates_hidden_below_min_cohort():
    data = {"interviews": [_inv(1, "s1", 80), _inv(2, "s2", 40)], "analytics": {}}
    o = insights.build_overview(ORG, MEMBERS, data, now=NOW)
    assert o["contributors"] == 2 and o["aggregates_available"] is False
    assert o["metric_means"] == {} and o["weekly"] == [] and o["topics"] == []
    assert o["completed_count"] == 2 and o["member_counts"] == {"instructor": 1, "candidate": 3}


def test_aggregates_shown_with_enough_students():
    data = {"interviews": [_inv(1, "s1", 80), _inv(2, "s2", 60), _inv(3, "s3", 70)], "analytics": {}}
    o = insights.build_overview(ORG, MEMBERS, data, now=NOW)
    assert o["aggregates_available"] is True
    assert o["metric_means"]["average"] == 70
    assert o["active_students_30d"] == 3 and o["month_interviews"] == 3


def test_weekly_average_hidden_for_small_weeks():
    data = {"interviews": [_inv(1, "s1", 80, "2026-09-21"), _inv(2, "s2", 60, "2026-10-05"),
                           _inv(3, "s3", 70, "2026-10-06"), _inv(4, "s1", 90, "2026-10-07")], "analytics": {}}
    weeks = {w["week"]: w for w in insights.build_overview(ORG, MEMBERS, data, now=NOW)["weekly"]}
    assert weeks["2026-W39"]["average"] is None and weeks["2026-W39"]["count"] == 1  # tek öğrenci -> ortalama gizli
    assert weeks["2026-W41"]["average"] == 73.3                                      # 3 öğrenci -> görünür


# --- üye satırları ---

def test_member_score_only_with_consent():
    data = {"interviews": [_inv(1, "s1", 80), _inv(2, "s2", 40), _inv(3, "s2", 50)], "analytics": {}}
    rows = {r["user_id"]: r for r in insights.build_member_rows(MEMBERS, data, {"s1": {"email": "s1@x.com", "name": "Bir"}})}
    assert rows["s1"]["average"] == 80 and rows["s1"]["email"] == "s1@x.com"
    assert rows["s2"]["average"] is None and rows["s2"]["interview_count"] == 2  # katılım görünür, skor gizli
    assert [r["role"] for r in insights.build_member_rows(MEMBERS, data, {})][0] == "instructor"


def test_member_progress_requires_consent_and_membership():
    data = {"interviews": [_inv(1, "s1", 80), _inv(2, "s2", 40)], "analytics": {}}
    with pytest.raises(PermissionError):
        insights.member_progress(MEMBERS, "s2", data)
    with pytest.raises(ValueError):
        insights.member_progress(MEMBERS, "stranger", data)
    p = insights.member_progress(MEMBERS, "s1", data)
    assert p["completed_count"] == 1 and [t["id"] for t in p["timeline"]] == ["i1"]  # başkasının mülakatı yok


def test_fetch_org_data_counts_only_org_context(monkeypatch):
    calls = []
    monkeypatch.setattr(progress_service, "_fetch_completed", lambda filters: calls.append(filters) or {"interviews": [], "analytics": {}})
    progress_service.fetch_org_data("org-a")
    assert calls == [{"org_id": "org-a"}]


# --- HTTP ---

@pytest.fixture
def as_user(monkeypatch):
    memberships = {("org-a", "teacher"): "instructor", ("org-a", "s1"): "candidate", ("org-a", "s2"): "candidate"}

    async def _get_membership(org_id, user_id):
        role = memberships.get((org_id, user_id))
        return {"role": role} if role else None

    monkeypatch.setattr(organization_service, "get_membership", _get_membership)
    monkeypatch.setattr(organization_service, "list_members", AsyncMock(return_value=MEMBERS))
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value=ORG))
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    monkeypatch.setattr(progress_service, "fetch_org_data",
                        lambda org_id: {"interviews": [_inv(1, "s1", 80), _inv(2, "s2", 40)], "analytics": {}})
    monkeypatch.setattr(insights, "get_identity", lambda uid: {"email": f"{uid}@x.com", "name": None})

    def _login(user_id):
        user = UserProfile(id=user_id, email=f"{user_id}@x.com", created_at="2026-01-01T00:00:00Z", user_metadata={}, app_metadata={})
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _login
    app.dependency_overrides.clear()


def test_candidate_cannot_see_overview_or_members(as_user):
    client = as_user("s1")
    assert client.get("/api/v1/organizations/org-a/overview").status_code == 403
    assert client.get("/api/v1/organizations/org-a/members").status_code == 403


def test_instructor_member_list_hides_unshared_scores(as_user):
    rows = {r["user_id"]: r for r in as_user("teacher").get("/api/v1/organizations/org-a/members").json()}
    assert rows["s1"]["average"] == 80 and rows["s2"]["average"] is None


def test_instructor_cannot_open_unshared_student_progress(as_user):
    client = as_user("teacher")
    assert client.get("/api/v1/organizations/org-a/members/s2/progress").status_code == 403
    resp = client.get("/api/v1/organizations/org-a/members/s1/progress")
    assert resp.status_code == 200 and resp.json()["completed_count"] == 1
    organization_service.log_audit.assert_awaited()  # görüntüleme denetim kaydına yazıldı


def test_sharing_toggle_applies_to_caller_only(as_user, monkeypatch):
    setter = AsyncMock(return_value=True)
    monkeypatch.setattr(organization_service, "set_share_progress", setter)
    resp = as_user("s2").put("/api/v1/organizations/org-a/me/sharing", json={"share_progress": True})
    assert resp.status_code == 200
    setter.assert_awaited_once_with("org-a", "s2", True)


def test_non_member_cannot_toggle_sharing(as_user):
    assert as_user("stranger").put("/api/v1/organizations/org-a/me/sharing", json={"share_progress": True}).status_code == 403


def test_only_org_admin_updates_settings(as_user):
    assert as_user("teacher").patch("/api/v1/organizations/org-a", json={"monthly_interview_quota": 50}).status_code == 403
