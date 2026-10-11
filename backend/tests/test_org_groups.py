"""
Faz 4C — gruplar, toplu davet, rubrik ve CSV dışa aktarma testleri.
Gerçek Supabase çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_org_groups.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.main import app
from app.services import assignment_service, organization_service, progress_service
from app.services import org_export_service as export
from app.services import org_group_service as groups
from app.services import org_insights_service as insights

MEMBERS = [
    {"user_id": "admin", "role": "org_admin", "share_progress": False, "group_id": None},
    {"user_id": "teacher", "role": "instructor", "share_progress": False, "group_id": None},
    {"user_id": "s1", "role": "candidate", "share_progress": True, "group_id": "g1"},
    {"user_id": "s2", "role": "candidate", "share_progress": False, "group_id": "g1"},
    {"user_id": "s3", "role": "candidate", "share_progress": True, "group_id": "g2"},
]


def _inv(i, user, t=80, c=40, v=60):
    return {"id": f"i{i}", "user_id": user, "status": "completed", "topic": "React", "role": "FE",
            "technical_score": t, "confidence_score": c, "vocabulary_score": v,
            "created_at": f"2026-10-0{i}T10:00:00+00:00"}


# --- rubrik ---

def test_weighted_average_uses_rubric_and_renormalizes_missing_metric():
    point = {"technical": 80.0, "confidence": 40.0, "vocabulary": 60.0}
    assert progress_service.weighted_average(point) == 60.0
    assert progress_service.weighted_average(point, {"technical": 60, "confidence": 20, "vocabulary": 20}) == 68.0
    # özgüven yoksa teknik/iletişim kendi aralarında 60:20 -> 75
    missing = {"technical": 80.0, "confidence": None, "vocabulary": 60.0}
    assert progress_service.weighted_average(missing, {"technical": 60, "confidence": 20, "vocabulary": 20}) == 75.0


def test_member_rows_apply_rubric_only_to_consenting_students():
    data = {"interviews": [_inv(1, "s1"), _inv(2, "s2")], "analytics": {}}
    rows = {r["user_id"]: r for r in insights.build_member_rows(
        MEMBERS, data, {}, {"technical": 100, "confidence": 0, "vocabulary": 0})}
    assert rows["s1"]["average"] == 80.0 and rows["s2"]["average"] is None
    assert rows["s1"]["group_id"] == "g1"


def test_rubric_schema_requires_sum_100(client_as):
    resp = client_as("admin").patch("/api/v1/organizations/org-a",
                                    json={"rubric": {"technical": 50, "confidence": 30, "vocabulary": 30}})
    assert resp.status_code == 422


# --- grup kapsamı ---

def test_scope_to_group_keeps_only_group_members_and_their_interviews():
    data = {"interviews": [_inv(1, "s1"), _inv(2, "s2"), _inv(3, "s3")], "analytics": {}}
    scoped, scoped_data = insights.scope_to_group(MEMBERS, data, "g1")
    assert {m["user_id"] for m in scoped} == {"s1", "s2"}
    assert {i["user_id"] for i in scoped_data["interviews"]} == {"s1", "s2"}
    assert insights.scope_to_group(MEMBERS, data, None) == (MEMBERS, data)


def test_small_group_hides_aggregates():
    data = {"interviews": [_inv(1, "s1"), _inv(2, "s2"), _inv(3, "s3")], "analytics": {}}
    scoped, scoped_data = insights.scope_to_group(MEMBERS, data, "g1")
    overview = insights.build_overview({"id": "org-a", "name": "A"}, scoped, scoped_data)
    assert overview["aggregates_available"] is False and overview["metric_means"] == {}


def test_assignment_targets_only_group_students():
    group_assignment = {"id": "a1", "group_id": "g1"}
    assert {m["user_id"] for m in assignment_service.targets(group_assignment, MEMBERS)} == {"s1", "s2"}
    assert {m["user_id"] for m in assignment_service.targets({"id": "a2"}, MEMBERS)} == {"s1", "s2", "s3"}
    rows = assignment_service.build_assignment_rows(MEMBERS, [], {}, group_assignment)
    assert {r["user_id"] for r in rows} == {"s1", "s2"}


def test_student_of_other_group_cannot_start_group_assignment(monkeypatch):
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "a1", "org_id": "org-a", "group_id": "g1"}])
    monkeypatch.setattr(assignment_service, "supabase", fake)
    monkeypatch.setattr(organization_service, "get_membership",
                        AsyncMock(return_value={"role": "candidate", "group_id": "g2"}))
    assert asyncio.run(assignment_service.get_assignment_for_member("s3", "a1")) is None
    monkeypatch.setattr(organization_service, "get_membership",
                        AsyncMock(return_value={"role": "candidate", "group_id": "g1"}))
    assert asyncio.run(assignment_service.get_assignment_for_member("s1", "a1"))["id"] == "a1"


# --- toplu davet ---

def test_plan_invites_splits_invalid_members_and_duplicates():
    plan = groups.plan_invites(
        [{"email": " Ali@Okul.edu.tr ", "group": "A Şubesi"}, {"email": "ali@okul.edu.tr", "group": "B"},
         {"email": "not-an-email"}, {"email": ""}, {"email": "s1@x.com"}, {"email": "=cmd()@x"}],
        ["S1@x.com"],
    )
    assert plan["valid"] == {"ali@okul.edu.tr": "A Şubesi"}  # ilk satır geçerli
    assert plan["already_member"] == ["s1@x.com"]
    assert plan["invalid"] == ["not-an-email", "=cmd()@x"]


def test_cannot_accept_invite_of_another_email(monkeypatch):
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "inv1", "org_id": "org-a", "email": "ali@okul.edu.tr", "role": "candidate"}])
    monkeypatch.setattr(groups, "supabase", fake)
    with pytest.raises(ValueError):
        asyncio.run(groups.respond_to_invite("u-mallory", "mallory@x.com", "inv1", True))
    fake.table.return_value.insert.assert_not_called()


def test_accepting_invite_creates_membership_with_group(monkeypatch):
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "inv1", "org_id": "org-a", "email": "ali@okul.edu.tr", "role": "candidate", "group_id": "g1"}])
    monkeypatch.setattr(groups, "supabase", fake)
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value=None))
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    assert asyncio.run(groups.respond_to_invite("u-ali", "ALI@okul.edu.tr", "inv1", True))["accepted"] is True
    fake.table.return_value.insert.assert_called_once_with(
        {"org_id": "org-a", "user_id": "u-ali", "role": "candidate", "group_id": "g1"})


# --- CSV ---

def test_members_csv_hides_unshared_scores_and_escapes_formulas():
    rows = [
        {"name": "=HYPERLINK(\"x\")", "email": "s1@x.com", "role": "candidate", "group_id": "g1",
         "interview_count": 2, "last_interview_at": "2026-10-01T10:00:00+00:00", "average": 72.5, "share_progress": True},
        {"name": "Can", "email": "s2@x.com", "role": "candidate", "group_id": None,
         "interview_count": 1, "last_interview_at": None, "average": 40.0, "share_progress": False},
    ]
    text = export.members_csv(rows, {"g1": "A Şubesi"})
    assert text.startswith("﻿Ad;E-posta;Rol;Grup")
    lines = text.strip("﻿").splitlines()
    assert lines[1].startswith("\"'=HYPERLINK") and "A Şubesi" in lines[1] and "72,5" in lines[1]
    assert lines[2].endswith(";Hayır") and "40" not in lines[2]


# --- HTTP yetkileri ---

@pytest.fixture
def client_as(monkeypatch):
    roles = {("org-a", u["user_id"]): u["role"] for u in MEMBERS}

    async def _get_membership(org_id, user_id):
        role = roles.get((org_id, user_id))
        return {"role": role} if role else None

    monkeypatch.setattr(organization_service, "get_membership", _get_membership)
    monkeypatch.setattr(organization_service, "list_members", AsyncMock(return_value=MEMBERS))
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value={"id": "org-a", "name": "A"}))
    monkeypatch.setattr(organization_service, "log_audit", AsyncMock(return_value=None))
    monkeypatch.setattr(insights, "get_identity", lambda uid: {"email": f"{uid}@x.com", "name": None})

    def _login(user_id):
        user = UserProfile(id=user_id, email=f"{user_id}@x.com", created_at="2026-01-01T00:00:00Z", user_metadata={}, app_metadata={})
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _login
    app.dependency_overrides.clear()


def test_candidate_cannot_manage_groups_or_invites(client_as):
    c = client_as("s1")
    assert c.post("/api/v1/organizations/org-a/groups", json={"name": "A"}).status_code == 403
    assert c.post("/api/v1/organizations/org-a/invites", json={"rows": [{"email": "a@b.co"}]}).status_code == 403
    assert c.get("/api/v1/organizations/org-a/export/members.csv").status_code == 403


def test_instructor_cannot_invite_instructors(client_as):
    resp = client_as("teacher").post("/api/v1/organizations/org-a/invites",
                                     json={"rows": [{"email": "a@b.co"}], "role": "instructor"})
    assert resp.status_code == 403


def test_bulk_invite_skips_existing_members(client_as, monkeypatch):
    create = AsyncMock(return_value={"invited": 1, "already_member": ["s1@x.com"], "invalid": [], "truncated": 0})
    monkeypatch.setattr(groups, "create_invites", create)
    resp = client_as("teacher").post("/api/v1/organizations/org-a/invites",
                                     json={"rows": [{"email": "new@x.com"}, {"email": "s1@x.com"}]})
    assert resp.status_code == 200 and resp.json()["invited"] == 1
    assert "s1@x.com" in create.await_args.args[5]  # mevcut üyelerin e-postaları iletildi


def test_export_members_csv_endpoint(client_as, monkeypatch):
    monkeypatch.setattr(progress_service, "fetch_org_data",
                        lambda org_id: {"interviews": [_inv(1, "s1"), _inv(2, "s2")], "analytics": {}})
    monkeypatch.setattr(groups, "list_groups", AsyncMock(return_value=[{"id": "g1", "name": "A Şubesi"}]))
    resp = client_as("teacher").get("/api/v1/organizations/org-a/export/members.csv")
    assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/csv")
    body = resp.content.decode("utf-8-sig")
    assert "s1@x.com" in body and "A Şubesi" in body
    s2_line = next(line for line in body.splitlines() if line.startswith(";s2@x.com"))
    assert s2_line.endswith(";Hayır") and ";60," not in s2_line  # rıza yok -> skor yok


def test_my_invites_route_is_not_shadowed_by_org_routes(client_as, monkeypatch):
    monkeypatch.setattr(groups, "my_invites", AsyncMock(return_value=[]))
    assert client_as("s1").get("/api/v1/organizations/invites/me").status_code == 200
