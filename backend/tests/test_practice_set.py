"""
Zayıf konular için pratik seti: konu seçimi, yalnızca konu soruları, seviye ve görülmüşlük
sırası, "bu setle mülakat yap". Gerçek Supabase/LLM çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_practice_set.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.api.routes.interview as interview_route
from app.services import practice_service as ps
from app.services import progress_service
from app.services import question_bank_service as qb
from app.services.llm_service import llm_service

from test_interview_chat_flow import client, _mock_interview_service  # noqa: F401
from test_jobs import api  # noqa: F401

PY = {"topic": "Python", "role": "Backend Developer", "difficulty": "ORTA", "average": 42.8, "count": 3, "weak": True}
DS = {"topic": "Veri Yapıları", "role": "Frontend Developer", "difficulty": "ORTA", "average": 49.8, "count": 2, "weak": True}
REACT = {"topic": "React", "role": "Frontend Developer", "difficulty": "ORTA", "average": 82, "count": 4, "weak": False}


def _q(qid, tags, difficulty="ORTA", qtype="teknik"):
    return {"id": qid, "question_text": f"Soru {qid}", "difficulty": difficulty, "tags": tags, "question_type": qtype,
            "answer_points": ["madde"], "times_served": 0, "family_id": None, "org_id": None}


# --- konu seçimi ---

def test_target_topics_prefers_weak_then_lowest_average():
    assert [t["topic"] for t in ps.target_topics([REACT, DS, PY])] == ["Veri Yapıları", "Python"]
    strong = [{**REACT, "average": 90}, {**DS, "weak": False, "average": 76}]
    assert [t["topic"] for t in ps.target_topics(strong)] == ["Veri Yapıları", "React"]
    assert ps.target_topics([]) == []


# --- soru seçimi ---

def _setup(monkeypatch, topics, rows, seen=()):
    monkeypatch.setattr(ps, "supabase", MagicMock())
    monkeypatch.setattr(progress_service, "get_user_progress", lambda uid: {"topics": topics})
    monkeypatch.setattr(ps, "_seen_question_ids", AsyncMock(return_value=set(seen)))
    monkeypatch.setattr(qb, "_fetch_tagged_rows", AsyncMock(return_value=rows))
    monkeypatch.setattr(qb, "_rng", MagicMock(random=lambda: 0.0))


def test_only_on_topic_questions_never_role_only(monkeypatch):
    # Canlıda: Python soruları görülmüş olunca set SQL/API sorularına kayıyordu.
    rows = [_q("py1", ["python"]), _q("sql1", ["sql", "backend"]), _q("api1", ["rest", "backend"])]
    _setup(monkeypatch, [PY], rows, seen={"py1"})
    out = asyncio.run(ps.build_practice_set("u1"))
    assert [i["id"] for i in out["items"]] == ["py1"]  # görülmüş ama konu sorusu; konu dışı yok


def test_order_unseen_at_level_then_seen_then_harder(monkeypatch):
    rows = [_q("hard", ["python"], "UZMAN"), _q("seen", ["python"], "ORTA"), _q("easy", ["python"], "JUNIOR"),
            _q("mid", ["python"], "ORTA")]
    _setup(monkeypatch, [PY], rows, seen={"seen"})
    ids = [i["id"] for i in asyncio.run(ps.build_practice_set("u1", size=4))["items"]]
    assert ids.index("hard") == 3 and ids.index("seen") == 2 and set(ids[:2]) == {"mid", "easy"}


def test_split_across_topics_and_item_shape(monkeypatch):
    rows = [_q(f"py{i}", ["python"]) for i in range(4)] + [_q(f"ds{i}", ["veri-yapilari"]) for i in range(4)]
    _setup(monkeypatch, [PY, DS], rows)
    monkeypatch.setattr(ps, "interview_tags", lambda role, topic, hint: ({"python"} if topic == "Python" else {"veri-yapilari"}, set()))
    out = asyncio.run(ps.build_practice_set("u1", size=5))
    topics = [i["topic"] for i in out["items"]]
    assert len(topics) == 5 and topics.count("Python") == 3 and topics.count("Veri Yapıları") == 2
    assert out["items"][0]["answer_points"] == ["madde"] and out["reason"] is None


def test_no_history_and_unknown_topic(monkeypatch):
    _setup(monkeypatch, [], [])
    assert asyncio.run(ps.build_practice_set("u1"))["reason"] == "no_history"
    _setup(monkeypatch, [{**PY, "topic": "Kuantum Origami"}], [])
    out = asyncio.run(ps.build_practice_set("u1"))
    assert out["items"] == [] and out["unmatched_topics"] == ["Kuantum Origami"] and out["reason"] == "no_questions"


# --- HTTP ---

def test_practice_set_endpoint_and_503(api, monkeypatch):
    monkeypatch.setattr(ps, "build_practice_set", AsyncMock(return_value={"topics": [], "items": [], "unmatched_topics": [], "reason": "no_history"}))
    assert api.get("/api/v1/progress/me/practice-set").json()["reason"] == "no_history"
    monkeypatch.setattr(ps, "build_practice_set", AsyncMock(side_effect=RuntimeError("db")))
    assert api.get("/api/v1/progress/me/practice-set").status_code == 503


def _start_mocks(monkeypatch, pool_by_ids):
    fetch_pool = AsyncMock(return_value=[{"id": "bank", "question_text": "Banka", "similarity": 0.5, "answer_points": []}])
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", fetch_pool)
    by_ids = AsyncMock(return_value=pool_by_ids)
    monkeypatch.setattr(ps, "fetch_pool_by_ids", by_ids)
    create = AsyncMock(return_value={"id": "interview-1"})
    monkeypatch.setattr(interview_route, "create_interview", create)
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    monkeypatch.setattr(llm_service, "get_next_question", AsyncMock(return_value="Merhaba"))
    return fetch_pool, by_ids, create


def test_start_with_practice_questions_uses_them_in_order(client, monkeypatch):
    pool = [{"id": "q2", "question_text": "İki", "similarity": None, "answer_points": []},
            {"id": "q1", "question_text": "Bir", "similarity": None, "answer_points": []}]
    fetch_pool, by_ids, create = _start_mocks(monkeypatch, pool)
    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "question_ids": ["q2", "q1"]})
    assert resp.status_code == 200
    assert by_ids.await_args.args[0] == ["q2", "q1"] and create.await_args.kwargs["question_pool"] == pool
    fetch_pool.assert_not_awaited()


def test_start_falls_back_when_practice_questions_inaccessible(client, monkeypatch):
    fetch_pool, _, create = _start_mocks(monkeypatch, [])
    client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "question_ids": ["baska-kurumun"]})
    fetch_pool.assert_awaited_once()
    assert create.await_args.kwargs["question_pool"][0]["id"] == "bank"


def test_too_many_question_ids_rejected(client, monkeypatch):
    _start_mocks(monkeypatch, [])
    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "question_ids": [str(i) for i in range(11)]})
    assert resp.status_code == 422


def test_fetch_pool_by_ids_keeps_order_and_scopes_to_global(monkeypatch):
    calls = []

    class _Q:
        def __getattr__(self, name):
            def f(*a, **k):
                calls.append((name, a))
                return self
            return f

        def execute(self):
            return MagicMock(data=[{"id": "b", "question_text": "B", "answer_points": ["x"]}, {"id": "a", "question_text": "A"}])

    monkeypatch.setattr(ps, "supabase", MagicMock(table=lambda name: _Q()))
    pool = asyncio.run(ps.fetch_pool_by_ids(["a", "zz", "b", "a"]))
    assert [p["id"] for p in pool] == ["a", "b"]  # sıra korunur, erişilemeyen ve tekrar düşer
    assert ("is_", ("org_id", "null")) in calls and ("eq", ("is_active", True)) in calls
