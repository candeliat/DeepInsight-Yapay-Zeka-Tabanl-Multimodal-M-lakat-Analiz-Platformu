"""
profiles tablosu (sql/020): üye kimlikleri tek sorguyla, e-postayla kullanıcı tek sorguyla bulunur.
Önceden üye başına bir Auth admin isteği / tüm kullanıcıların sayfa sayfa listelenmesi gerekiyordu.
"""
import asyncio
from unittest.mock import MagicMock

from app.services import org_insights_service as insights
from app.services import organization_service


class _Query:
    def __init__(self, rows, calls):
        self.rows, self.calls = rows, calls

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args))
            return self
        return method

    def execute(self):
        if any(name == "in_" for name, _ in self.calls[-3:]):
            ids = [c for name, c in self.calls if name == "in_"][-1][1]
            return MagicMock(data=[r for r in self.rows if r["id"] in ids])
        return MagicMock(data=self.rows)


def _db(rows):
    calls = []
    db = MagicMock()
    db.table.side_effect = lambda name: calls.append(("table", (name,))) or _Query(rows, calls)
    db._calls = calls
    return db


def test_identities_come_from_one_profiles_query_and_missing_users_are_blank(monkeypatch):
    db = _db([
        {"id": "u1", "email": "ali@okul.edu.tr", "first_name": "Ali", "last_name": "Kaya"},
        {"id": "u2", "email": "ayse@okul.edu.tr", "first_name": None, "last_name": None},
    ])
    monkeypatch.setattr(insights, "supabase", db)
    result = asyncio.run(insights.get_identities(["u1", "u2", "u1", "silinmis"]))
    assert result == {
        "u1": {"email": "ali@okul.edu.tr", "name": "Ali Kaya"},
        "u2": {"email": "ayse@okul.edu.tr", "name": None},
        "silinmis": {"email": None, "name": None},
    }
    assert [c for c in db._calls if c[0] == "table"] == [("table", ("profiles",))]


def test_large_member_lists_are_read_in_chunks(monkeypatch):
    db = _db([])
    monkeypatch.setattr(insights, "supabase", db)
    asyncio.run(insights.get_identities([f"u{i}" for i in range(450)]))
    assert len([c for c in db._calls if c[0] == "table"]) == 3  # 200 + 200 + 50


def test_profile_read_failure_returns_blank_identities(monkeypatch):
    db = MagicMock()
    db.table.return_value.select.return_value.in_.return_value.execute.side_effect = RuntimeError("db yok")
    monkeypatch.setattr(insights, "supabase", db)
    assert asyncio.run(insights.get_identity("u1")) == {"email": None, "name": None}


def test_find_user_by_email_uses_profiles_and_requires_exact_match(monkeypatch):
    # ilike'ta "_" joker: "a_b@x.com" araması "axb@x.com"u da döndürebilir; tam eşleşme şart.
    db = _db([{"id": "u-joker", "email": "axb@x.com"}, {"id": "u-dogru", "email": "A_B@x.com"}])
    monkeypatch.setattr(organization_service, "supabase", db)
    assert asyncio.run(organization_service._find_user_id_by_email(" a_b@X.com ")) == "u-dogru"
    assert asyncio.run(organization_service._find_user_id_by_email("yok@x.com")) is None
    db.auth.admin.list_users.assert_not_called()
