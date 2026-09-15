"""
`question_bank_admin_service.py`'deki soru önerisi (candidate) kuyruğu
fonksiyonları için birim testleri — Supabase ve LLM'e gerçek istek ATILMAZ.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_question_bank_admin_service.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.services.question_bank_admin_service as admin_service
from app.services.llm_service import llm_service


def run(coro):
    return asyncio.run(coro)


class _FakeResult:
    def __init__(self, data):
        self.data = data


def test_generate_candidates_for_gaps_creates_pending_rows(monkeypatch):
    monkeypatch.setattr(
        llm_service, "generate_question_candidate",
        AsyncMock(return_value="Yeni üretilen soru metni?"),
    )

    fake = MagicMock()
    gaps_chain = MagicMock()
    gaps_chain.order.return_value.limit.return_value.execute.return_value = _FakeResult([
        {"id": "g-1", "role": "Backend Developer", "topic": "Python", "difficulty": "ORTA", "miss_count": 5},
    ])
    candidates_insert_result = _FakeResult([{"id": "c-1", "status": "pending"}])

    def _table(name):
        if name == "question_bank_gaps":
            t = MagicMock()
            t.select.return_value = gaps_chain
            return t
        if name == "question_bank_candidates":
            t = MagicMock()
            t.insert.return_value.execute.return_value = candidates_insert_result
            return t
        raise AssertionError(f"Beklenmeyen table(): {name}")

    fake.table.side_effect = _table
    monkeypatch.setattr(admin_service, "supabase", fake)

    created = run(admin_service.generate_candidates_for_gaps(limit=5))

    assert created == [{"id": "c-1", "status": "pending"}]


def test_generate_candidates_for_gaps_skips_failing_gap_and_continues(monkeypatch):
    calls = {"n": 0}

    async def _side_effect(role, topic, difficulty):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("model çöktü")
        return "İkinci boşluk için öneri."

    monkeypatch.setattr(llm_service, "generate_question_candidate", _side_effect)

    fake = MagicMock()
    gaps_chain = MagicMock()
    gaps_chain.order.return_value.limit.return_value.execute.return_value = _FakeResult([
        {"id": "g-1", "role": "X", "topic": "Y", "difficulty": None, "miss_count": 5},
        {"id": "g-2", "role": "A", "topic": "B", "difficulty": None, "miss_count": 3},
    ])
    candidates_insert_result = _FakeResult([{"id": "c-2", "status": "pending"}])

    def _table(name):
        if name == "question_bank_gaps":
            t = MagicMock()
            t.select.return_value = gaps_chain
            return t
        if name == "question_bank_candidates":
            t = MagicMock()
            t.insert.return_value.execute.return_value = candidates_insert_result
            return t
        raise AssertionError(f"Beklenmeyen table(): {name}")

    fake.table.side_effect = _table
    monkeypatch.setattr(admin_service, "supabase", fake)

    created = run(admin_service.generate_candidates_for_gaps(limit=5))

    # İlk boşluk başarısız oldu ama ikinci boşluk için üretim yine de denendi.
    assert len(created) == 1
    assert created[0]["id"] == "c-2"


def test_approve_candidate_creates_question_and_marks_approved(monkeypatch):
    fake = MagicMock()
    candidates_table = MagicMock()
    candidates_table.select.return_value.eq.return_value.execute.return_value = _FakeResult([
        {"id": "c-1", "role": "Backend Developer", "topic": "Python", "difficulty": "ORTA", "question_text": "Öneri metni?"},
    ])
    candidates_table.update.return_value.eq.return_value.execute.return_value = _FakeResult([{"id": "c-1"}])

    def _table(name):
        if name == "question_bank_candidates":
            return candidates_table
        raise AssertionError(f"Beklenmeyen table(): {name}")

    fake.table.side_effect = _table
    monkeypatch.setattr(admin_service, "supabase", fake)

    create_mock = AsyncMock(return_value={"id": "q-new", "question_text": "Öneri metni?"})
    monkeypatch.setattr(admin_service, "create_question", create_mock)

    result = run(admin_service.approve_candidate("c-1"))

    assert result == {"id": "q-new", "question_text": "Öneri metni?"}
    create_mock.assert_awaited_once()
    assert create_mock.await_args.kwargs["question_text"] == "Öneri metni?"
    candidates_table.update.assert_called_once()
    assert candidates_table.update.call_args.args[0]["status"] == "approved"


def test_approve_candidate_raises_when_not_found(monkeypatch):
    fake = MagicMock()
    candidates_table = MagicMock()
    candidates_table.select.return_value.eq.return_value.execute.return_value = _FakeResult([])
    fake.table.return_value = candidates_table
    monkeypatch.setattr(admin_service, "supabase", fake)

    with pytest.raises(ValueError):
        run(admin_service.approve_candidate("does-not-exist"))


def test_reject_candidate_marks_rejected(monkeypatch):
    fake = MagicMock()
    candidates_table = MagicMock()
    candidates_table.update.return_value.eq.return_value.execute.return_value = _FakeResult([{"id": "c-1"}])
    fake.table.return_value = candidates_table
    monkeypatch.setattr(admin_service, "supabase", fake)

    run(admin_service.reject_candidate("c-1"))

    candidates_table.update.assert_called_once()
    assert candidates_table.update.call_args.args[0]["status"] == "rejected"
