"""
`question_bank_service.fetch_question_pool` için birim testleri — Supabase ve
embedding API'sine gerçek istek ATILMAZ; `llm_service.embed_text` ve
`question_bank_service.supabase` mock'lanır.

Ana amaç: banka boş/yetersiz olduğunda ya da embedding/RPC hata verdiğinde
fonksiyonun HER ZAMAN sessizce boş/kısmi bir liste döndürdüğünü (asla
exception fırlatmadığını) doğrulamak — mülakat akışı bu garantiye dayanıyor
(bkz. app/api/routes/interview.py:_ask_question).

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_question_bank_service.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.services.question_bank_service as question_bank_service
from app.services.llm_service import llm_service


def run(coro):
    """pytest-asyncio eklentisine ihtiyaç duymadan async test gövdelerini çalıştırır (bkz. test_llm_service.py)."""
    return asyncio.run(coro)


class _FakeRpcResult:
    def __init__(self, data):
        self.data = data


def _fake_supabase(rpc_return_rows):
    fake = MagicMock()
    fake.rpc.return_value.execute.return_value = _FakeRpcResult(rpc_return_rows)
    return fake


def test_fetch_question_pool_returns_rows_above_threshold(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.35)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([
        {"id": "q1", "question_text": "Soru 1", "role": "Backend Developer", "topic": "Python", "difficulty": "ORTA", "similarity": 0.8},
        {"id": "q2", "question_text": "Soru 2", "role": "Backend Developer", "topic": "Python", "difficulty": "ORTA", "similarity": 0.5},
    ])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(
        role="Backend Developer", topic="Python", difficulty="ORTA", size=5,
    ))

    assert pool == [
        {"id": "q1", "question_text": "Soru 1", "similarity": 0.8},
        {"id": "q2", "question_text": "Soru 2", "similarity": 0.5},
    ]
    # RPC'ye difficulty ve doğru match_count ile çağrılmalı.
    fake_supabase.rpc.assert_called_once()
    rpc_args = fake_supabase.rpc.call_args
    assert rpc_args[0][0] == "match_questions"
    assert rpc_args[0][1]["filter_difficulty"] == "ORTA"
    assert rpc_args[0][1]["match_count"] == 5


def test_fetch_question_pool_drops_rows_below_threshold(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.6)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([
        {"id": "q1", "question_text": "Soru 1", "role": "r", "topic": "t", "difficulty": None, "similarity": 0.9},
        {"id": "q2", "question_text": "Soru 2", "role": "r", "topic": "t", "difficulty": None, "similarity": 0.4},
    ])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert len(pool) == 1
    assert pool[0]["id"] == "q1"


def test_fetch_question_pool_returns_empty_when_embedding_fails(monkeypatch):
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(side_effect=RuntimeError("AI servisi ile iletişim kurulamadı.")))
    fake_supabase = _fake_supabase([])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert pool == []
    fake_supabase.rpc.assert_not_called()


def test_fetch_question_pool_returns_empty_when_rpc_fails(monkeypatch):
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))
    fake_supabase = MagicMock()
    fake_supabase.rpc.return_value.execute.side_effect = RuntimeError("RPC bulunamadı")
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert pool == []


def test_fetch_question_pool_returns_empty_when_supabase_not_configured(monkeypatch):
    monkeypatch.setattr(question_bank_service, "supabase", None)
    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))
    assert pool == []


def test_fetch_question_pool_returns_empty_when_size_zero(monkeypatch):
    fake_supabase = _fake_supabase([])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)
    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=0))
    assert pool == []
    fake_supabase.rpc.assert_not_called()
