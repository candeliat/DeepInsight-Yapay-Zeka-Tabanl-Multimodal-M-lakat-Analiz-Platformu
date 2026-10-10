"""
Kurum (tenant) uç noktaları ve `require_org_role` için izolasyon testleri.
Gerçek Supabase'e istek atılmaz: üyelikler `memberships` sözlüğünden gelir,
`organization_service` fonksiyonları mock'lanır.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_organizations_route.py -v
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.services import organization_service


def _user(user_id, platform_admin=False):
    return UserProfile(
        id=user_id, email=f"{user_id}@example.com", created_at="2026-01-01T00:00:00Z",
        user_metadata={}, app_metadata={"role": "admin"} if platform_admin else {},
    )


# (org_id, user_id) -> rol. Kurum A ve B'de farklı kişiler.
MEMBERSHIPS = {
    ("org-a", "admin-a"): "org_admin",
    ("org-a", "teacher-a"): "instructor",
    ("org-a", "student-a"): "candidate",
    ("org-b", "admin-b"): "org_admin",
}


@pytest.fixture
def as_user(monkeypatch):
    async def _get_membership(org_id, user_id):
        role = MEMBERSHIPS.get((org_id, user_id))
        return {"org_id": org_id, "user_id": user_id, "role": role} if role else None

    monkeypatch.setattr(organization_service, "get_membership", _get_membership)
    monkeypatch.setattr(organization_service, "list_members", AsyncMock(return_value=[]))
    monkeypatch.setattr(organization_service, "rotate_invite_code", AsyncMock(return_value="yeni-kod"))

    def _login(user_id, platform_admin=False):
        user = _user(user_id, platform_admin)
        app.dependency_overrides[oauth2_scheme] = lambda: "fake-token"
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _login
    app.dependency_overrides.clear()


def test_non_member_cannot_list_members(as_user):
    assert as_user("outsider").get("/api/v1/organizations/org-a/members").status_code == 403


def test_candidate_cannot_list_members(as_user):
    assert as_user("student-a").get("/api/v1/organizations/org-a/members").status_code == 403


def test_instructor_can_list_members(as_user):
    assert as_user("teacher-a").get("/api/v1/organizations/org-a/members").status_code == 200


def test_instructor_cannot_rotate_invite_code(as_user):
    assert as_user("teacher-a").post("/api/v1/organizations/org-a/invite-code/rotate").status_code == 403


def test_org_admin_can_rotate_invite_code(as_user):
    resp = as_user("admin-a").post("/api/v1/organizations/org-a/invite-code/rotate")
    assert resp.status_code == 200
    assert resp.json() == {"invite_code": "yeni-kod"}


def test_admin_of_one_org_cannot_access_another_org(as_user):
    client = as_user("admin-a")
    assert client.get("/api/v1/organizations/org-b/members").status_code == 403
    assert client.post("/api/v1/organizations/org-b/invite-code/rotate").status_code == 403


def test_platform_admin_can_access_any_org(as_user):
    assert as_user("root", platform_admin=True).get("/api/v1/organizations/org-b/members").status_code == 200


def test_only_platform_admin_can_create_organization(as_user):
    resp = as_user("admin-a").post("/api/v1/organizations", json={"name": "Yeni Kurum"})
    assert resp.status_code == 403


def test_demoting_last_org_admin_returns_409(as_user, monkeypatch):
    monkeypatch.setattr(
        organization_service, "update_member_role",
        AsyncMock(side_effect=PermissionError("Kurumun son yöneticisinin rolü değiştirilemez")),
    )
    resp = as_user("admin-a").patch("/api/v1/organizations/org-a/members/admin-a", json={"role": "candidate"})
    assert resp.status_code == 409


def test_join_with_invalid_invite_code_returns_404(as_user, monkeypatch):
    monkeypatch.setattr(organization_service, "join_by_invite_code", AsyncMock(side_effect=ValueError("Geçersiz davet kodu")))
    resp = as_user("student-a").post("/api/v1/organizations/join", json={"invite_code": "yanlis-kod"})
    assert resp.status_code == 404
