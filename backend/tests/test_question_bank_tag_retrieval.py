"""
Etiket tabanlı soru seçimi (question_tags + question_bank_service.fetch_question_pool).

Neden: canlı ölçümde embedding benzerliği konu ayrımı yapamadı ("Backend / Python"
sorgusu kendi Python sorularına 0.18 verip eşik altında kaldı; "Veri Yapıları"
sorgusu alakasız bir ML sorusunu eşik üstünde getirdi). Bu testler etiketin
belirleyici, embedding'in yedek olduğunu kilitler. Supabase ve embedding API'sine
gerçek istek atılmaz.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.services.question_bank_service as qbs
from app.services.llm_service import llm_service
from app.services.question_tags import interview_tags, normalize_tags


def run(coro):
    return asyncio.run(coro)


def _q(id_, tags, difficulty="ORTA", qtype="teknik", times_served=0, points=None):
    return {
        "id": id_, "question_text": f"Soru {id_}", "difficulty": difficulty, "family_id": None,
        "times_served": times_served, "tags": tags, "question_type": qtype,
        "answer_points": points or [f"nokta {id_}"], "org_id": None,
    }


class _Query:
    """table('question_bank') zinciri: her filtre kendini döner, execute satırları verir."""

    def __init__(self, rows, calls):
        self.rows, self.calls = rows, calls

    def __getattr__(self, name):
        def _chain(*args, **kwargs):
            self.calls.append((name, args))
            return self
        return _chain

    def execute(self):
        return MagicMock(data=list(self.rows))


def _fake_supabase(rows):
    calls = []
    fake = MagicMock()
    gaps = MagicMock()
    gaps.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    gaps.select.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(data=[])

    def _table(name):
        if name == "question_bank":
            q = MagicMock()
            q.select.side_effect = lambda *a, **k: _Query(rows, calls)
            return q
        return gaps

    fake.table.side_effect = _table
    fake.rpc.return_value.execute.return_value = MagicMock(data=[])
    fake.calls = calls
    return fake


def _no_embedding(monkeypatch):
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(side_effect=AssertionError("embedding çağrılmamalı")))


def test_interview_tags_topic_vs_role():
    topic, weak = interview_tags("Frontend Geliştirici", "React ve TypeScript")
    assert topic == {"react", "typescript"}
    assert "javascript" in weak and "react" not in weak

    assert interview_tags("Backend Geliştirici", "Java Spring Boot")[0] == {"java", "spring"}
    assert interview_tags("Yazılım Mühendisi", "Veri Yapıları ve Algoritmalar")[0] == {"veriyapilari", "algoritma"}
    # Yazılım dışı konu: konu etiketi çıkmaz -> etiket araması yapılmaz (embedding yedeği).
    assert interview_tags("Uzay Mühendisi", "Roket itkisi")[0] == set()


def test_normalize_tags_canonicalizes_and_drops_unknown():
    assert normalize_tags(["ReactJS", "nextjs", "ml", "family-demo", "react"]) == ["react", "next", "machinelearning"]


def test_tag_matches_fill_pool_without_calling_embedding(monkeypatch):
    rows = [_q(f"r{i}", ["react", "javascript"]) for i in range(6)]
    monkeypatch.setattr(qbs, "supabase", _fake_supabase(rows))
    _no_embedding(monkeypatch)

    pool = run(qbs.fetch_question_pool("Frontend Geliştirici", "React", "ORTA", size=5))

    assert len(pool) == 5
    assert all(p["id"].startswith("r") for p in pool)
    assert pool[0]["answer_points"] == [f"nokta {pool[0]['id']}"]


def test_off_topic_rows_are_never_selected(monkeypatch):
    # Veritabanı sorgusu örtüşen her şeyi döndürse bile sıralama konu dışını eler.
    rows = [_q("ml", ["machinelearning"]), _q("ds1", ["veriyapilari"]), _q("ds2", ["algoritma", "veriyapilari"])]
    monkeypatch.setattr(qbs, "supabase", _fake_supabase(rows))
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1]))

    pool = run(qbs.fetch_question_pool("Yazılım Mühendisi", "Veri Yapıları ve Algoritmalar", None, size=5))

    ids = [p["id"] for p in pool]
    assert "ml" not in ids
    assert ids[0] == "ds2"  # iki konu etiketiyle örtüşen önce


def test_exact_difficulty_preferred_and_adjacent_fills(monkeypatch):
    rows = [_q("j1", ["python"], "JUNIOR"), _q("o1", ["python"], "ORTA"), _q("o2", ["python"], "ORTA"),
            _q("u1", ["python"], "UZMAN")]
    monkeypatch.setattr(qbs, "supabase", _fake_supabase(rows))
    monkeypatch.setattr(qbs, "_TIE_JITTER", 0.0)
    _no_embedding(monkeypatch)

    pool = run(qbs.fetch_question_pool("Backend Developer", "Python", "ORTA", size=4))

    assert {p["id"] for p in pool[:2]} == {"o1", "o2"}
    assert {p["id"] for p in pool[2:]} == {"j1", "u1"}


def test_behavioral_questions_only_for_behavioral_interviews(monkeypatch):
    rows = [_q("t1", ["python"]), _q("b1", ["davranissal", "python"], qtype="davranissal")]
    monkeypatch.setattr(qbs, "supabase", _fake_supabase(rows))
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1]))

    technical = run(qbs.fetch_question_pool("Backend Developer", "Python", None, size=2))
    assert [p["id"] for p in technical] == ["t1"]

    behavioral = run(qbs.fetch_question_pool("Yazılım Mühendisi", "Davranışsal mülakat", None, size=2))
    assert [p["id"] for p in behavioral] == ["b1"]


def test_unknown_topic_skips_tag_query_and_uses_semantic(monkeypatch):
    fake = _fake_supabase([_q("x", ["python"])])
    monkeypatch.setattr(qbs, "supabase", fake)
    embed = AsyncMock(return_value=[0.1])
    monkeypatch.setattr(llm_service, "embed_text", embed)

    pool = run(qbs.fetch_question_pool("Uzay Mühendisi", "Roket itkisi", None, size=3))

    assert pool == []
    embed.assert_awaited_once()
    assert not any(name == "overlaps" for name, _ in fake.calls)


def test_org_scope_includes_global_and_own_org(monkeypatch):
    fake = _fake_supabase([_q("r1", ["react"])])
    monkeypatch.setattr(qbs, "supabase", fake)
    _no_embedding(monkeypatch)

    run(qbs.fetch_question_pool("Frontend", "React", None, size=1, org_id="org-1"))

    assert ("or_", ("org_id.is.null,org_id.eq.org-1",)) in fake.calls


def test_questions_specific_to_topic_rank_above_cross_topic_ones(monkeypatch):
    # Python mülakatında, Python'a da değen ama esasen ML olan soru, saf Python sorusunun ardından gelir.
    rows = [_q("ml", ["machinelearning", "python"]), _q("py", ["python"])]
    monkeypatch.setattr(qbs, "supabase", _fake_supabase(rows))
    monkeypatch.setattr(qbs, "_TIE_JITTER", 0.0)
    _no_embedding(monkeypatch)

    pool = run(qbs.fetch_question_pool("Backend Developer", "Python", "ORTA", size=2))

    assert [p["id"] for p in pool] == ["py", "ml"]
