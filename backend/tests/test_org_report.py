"""
Kurum PDF raporu ve kullanım/maliyet raporu. Gerçek Supabase/LLM çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_org_report.py -v
"""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pymupdf
import pytest

import app.services.llm_service as llm_module
from app.services import assignment_service, org_report, org_usage_service, organization_service, progress_service
from app.services import org_group_service as groups

from test_assignments import as_user  # noqa: F401


def _row(model="m-a", purpose="evaluation", success=True, prompt=1000, completion=200, latency=8000,
         day="2026-10-05T10:00:00+00:00", interview="i1"):
    return {"model": model, "purpose": purpose, "success": success, "prompt_tokens": prompt, "completion_tokens": completion,
            "total_tokens": prompt + completion, "latency_ms": latency, "created_at": day, "interview_id": interview}


INTERVIEWS = [{"id": "i1", "user_id": "s1", "status": "completed"}, {"id": "i2", "user_id": "s2", "status": "ongoing"}]


# --- ay sınırları ---

def test_parse_month_uses_turkey_time_boundaries():
    start, end, label = org_usage_service.parse_month("2026-10")
    assert label == "2026-10"
    assert start == datetime(2026, 9, 30, 21, 0, tzinfo=timezone.utc)  # 1 Ekim 00:00 TR
    assert end == datetime(2026, 10, 31, 21, 0, tzinfo=timezone.utc)


def test_parse_month_december_and_default():
    _, end, _ = org_usage_service.parse_month("2026-12")
    assert end == datetime(2026, 12, 31, 21, 0, tzinfo=timezone.utc)
    # 31 Ekim 22:00 UTC = 1 Kasım 01:00 TR -> Kasım.
    assert org_usage_service.parse_month(None, now=datetime(2026, 10, 31, 22, 0, tzinfo=timezone.utc))[2] == "2026-11"
    with pytest.raises(ValueError):
        org_usage_service.parse_month("2026-13")


# --- özet ---

def test_summarize_totals_failures_and_cost():
    rows = [_row(), _row(success=False, prompt=0, completion=0, latency=30000),
            _row(model="m-b", purpose="question_stream", prompt=500, completion=100, interview="i2")]
    prices = {"m-a": {"input": 1.0, "output": 2.0}, "m-b": {"input": 0.5, "output": 0.5}}
    s = org_usage_service.summarize(rows, INTERVIEWS, prices)
    assert s["calls"] == 3 and s["failed_calls"] == 1 and s["success_rate"] == 66.7
    assert s["total_tokens"] == 1800 and s["tokens_per_interview"] == 900
    assert s["interviews_started"] == 2 and s["interviews_completed"] == 1 and s["students"] == 2
    # m-a: (1000*1 + 200*2)/1e6 = 0.0014 ; m-b: 600*0.5/1e6 = 0.0003
    assert s["estimated_cost_usd"] == 0.0017 and s["unpriced_models"] == []
    m_a = next(m for m in s["by_model"] if m["model"] == "m-a")
    assert m_a["avg_latency_ms"] == 8000  # başarısız denemenin süresi ortalamaya girmez
    assert {p["purpose"] for p in s["by_purpose"]} == {"Mülakat değerlendirmesi", "Soru üretimi"}


def test_tokens_per_interview_ignores_interviews_without_usage_records():
    # 3 mülakat başlatıldı ama yalnızca 1'inin kaydı var (diğerleri kayıt başlamadan önce).
    interviews = INTERVIEWS + [{"id": "i3", "user_id": "s3", "status": "completed"}]
    s = org_usage_service.summarize([_row(), _row()], interviews, {})
    assert s["interviews_started"] == 3 and s["metered_interviews"] == 1 and s["tokens_per_interview"] == 2400


def test_summarize_without_prices_has_no_cost():
    s = org_usage_service.summarize([_row()], INTERVIEWS, {})
    assert s["estimated_cost_usd"] is None and s["unpriced_models"] == ["m-a"]


def test_summarize_partial_prices_flags_unpriced():
    s = org_usage_service.summarize([_row(), _row(model="m-b")], INTERVIEWS, {"m-a": {"input": 1.0, "output": 1.0}})
    assert s["estimated_cost_usd"] == 0.0012 and s["unpriced_models"] == ["m-b"]


def test_summarize_empty():
    s = org_usage_service.summarize([], [], {})
    assert s["calls"] == 0 and s["success_rate"] is None and s["tokens_per_interview"] is None and s["estimated_cost_usd"] is None


def test_daily_buckets_use_turkey_date():
    s = org_usage_service.summarize([_row(day="2026-10-05T22:30:00+00:00")], [], {})
    assert s["daily"] == [{"date": "2026-10-06", "calls": 1, "total_tokens": 1200}]


def test_bad_prices_json_is_ignored(monkeypatch):
    monkeypatch.setattr(org_usage_service.settings, "LLM_PRICES_JSON", "{bozuk")
    assert org_usage_service.prices() == {}
    monkeypatch.setattr(org_usage_service.settings, "LLM_PRICES_JSON", '{"m-a": {"input": 0.1, "output": 0.4}}')
    assert org_usage_service.prices() == {"m-a": {"input": 0.1, "output": 0.4}}


# --- kullanım kaydının kuruma bağlanması ---

def test_usage_record_carries_org_only_when_bound(monkeypatch):
    written = []

    class _DB:
        def table(self, name):
            class _Q:
                def insert(self, record):
                    written.append(record)
                    return self

                def execute(self):
                    return None
            return _Q()

    import app.core.database as database
    monkeypatch.setattr(database, "supabase", _DB())
    monkeypatch.setattr(llm_module.settings, "LLM_USAGE_PERSIST", True)

    async def go():
        svc = llm_module.LLMService()
        svc._persist_usage("evaluation", "m-a", None, 0.0, None)  # bağlam yok: kişisel çağrı
        llm_module.bind_usage_context({"id": "int-1", "org_id": "org-a"})
        svc._persist_usage("evaluation", "m-a", None, 0.0, None)
        llm_module.bind_usage_context({"id": "int-2", "org_id": None})  # bireysel mülakat
        svc._persist_usage("evaluation", "m-a", None, 0.0, None)
        await asyncio.sleep(0)

    asyncio.run(go())
    assert "org_id" not in written[0] and "interview_id" not in written[0]
    assert written[1]["org_id"] == "org-a" and written[1]["interview_id"] == "int-1"
    assert "org_id" not in written[2] and written[2]["interview_id"] == "int-2"


# --- PDF ---

OVERVIEW_HIDDEN = {
    "org": {"id": "org-a", "name": "Ege <Kariyer>", "monthly_interview_quota": 100, "rubric": None},
    "member_counts": {"candidate": 2, "org_admin": 1}, "completed_count": 4, "contributors": 2,
    "active_students_30d": 2, "month_interviews": 3, "min_cohort": 3, "aggregates_available": False,
    "metric_means": {}, "weekly": [], "topics": [],
}
OVERVIEW_VISIBLE = {
    **OVERVIEW_HIDDEN, "contributors": 3, "aggregates_available": True,
    "metric_means": {"average": 71.2, "technical": 68, "confidence": 75, "vocabulary": 70},
    "weekly": [{"week": "2026-W40", "count": 5, "average": 70.0}, {"week": "2026-W41", "count": 2, "average": None}],
    "topics": [{"topic": "React", "count": 4, "average": 58, "weak": True}],
}
USAGE = org_usage_service.summarize([_row(), _row(success=False)], INTERVIEWS, {})
USAGE["month"] = "2026-10"


def _text(pdf: bytes) -> str:
    # Tablo hücreleri satır kaydırabildiği için boşluklar sadeleştirilir.
    flags = pymupdf.TEXTFLAGS_TEXT & ~pymupdf.TEXT_PRESERVE_LIGATURES  # "fi" bağı tek karakter olarak gelmesin
    return " ".join(" ".join(p.get_text(flags=flags) for p in pymupdf.open("pdf", pdf)).split())


def test_pdf_hides_aggregates_below_cohort_and_escapes_names():
    text = _text(org_report.build_org_report_pdf(OVERVIEW_HIDDEN, [], None))
    assert "Ege <Kariyer>" in text  # kaçışlanmış metin doğru görünür
    assert "en az 3 farklı öğrenci" in text and "Kurum ortalamaları" not in text
    assert "Yapay zekâ kullanımı" not in text  # kullanım verilmedi (eğitmen)


def test_pdf_with_aggregates_assignments_and_usage():
    assignments = [{"title": "React haftalık", "role": "Frontend", "topic": "React", "due_at": "2026-10-20T15:00:00+00:00",
                    "total_candidates": 4, "completed_count": 1, "in_progress_count": 2}]
    text = _text(org_report.build_org_report_pdf(OVERVIEW_VISIBLE, assignments, USAGE, group_name="A Şubesi"))
    assert "Grup: A Şubesi" in text and "Kurum ortalamaları" in text
    assert "gizli (<3 öğrenci)" in text  # o hafta 3'ten az öğrenci
    assert "React haftalık" in text and "1/4 (%25)" in text and "20.10.2026" in text
    assert "Yapay zekâ kullanımı ve maliyet — 2026-10" in text
    assert "hesaplanmadı (model fiyatı tanımlı değil)" in text
    assert "1 / " in text  # sayfa numarası


def test_pdf_paginates_long_assignment_lists():
    many = [{"title": f"Ödev {i}", "role": "R", "topic": "T", "due_at": None, "total_candidates": 3, "completed_count": 0,
             "in_progress_count": 0} for i in range(120)]
    doc = pymupdf.open("pdf", org_report.build_org_report_pdf(OVERVIEW_VISIBLE, many, USAGE))
    assert doc.page_count > 1 and "Ödev 119" in "".join(p.get_text() for p in doc)


# --- HTTP ---

@pytest.fixture
def report_mocks(monkeypatch):
    monkeypatch.setattr(progress_service, "fetch_org_data", lambda org_id: {"interviews": [], "analytics": {}})
    monkeypatch.setattr(assignment_service, "list_org_assignments", AsyncMock(return_value=[
        {"id": "a1", "title": "Kurum geneli", "group_id": None, "total_candidates": 3, "completed_count": 1},
        {"id": "a2", "title": "A grubu ödevi", "group_id": "g1", "total_candidates": 1, "completed_count": 0},
    ]))
    usage = AsyncMock(return_value=USAGE)
    monkeypatch.setattr(org_usage_service, "org_usage", usage)
    monkeypatch.setattr(groups, "get_group", AsyncMock(side_effect=lambda org, gid: {"id": gid, "name": "A Şubesi"} if gid == "g1" else None))
    return usage


def test_usage_endpoint_admin_only(as_user, monkeypatch):
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value={"id": "org-a", "name": "Ege"}))
    usage = AsyncMock(return_value={"month": "2026-10", "calls": 2})
    monkeypatch.setattr(org_usage_service, "org_usage", usage)
    roles = {("org-a", "admin1"): "org_admin", ("org-a", "teacher"): "instructor"}
    monkeypatch.setattr(organization_service, "get_membership",
                        AsyncMock(side_effect=lambda org, uid: {"role": roles[(org, uid)]} if (org, uid) in roles else None))
    assert as_user("teacher").get("/api/v1/organizations/org-a/usage").status_code == 403
    resp = as_user("admin1").get("/api/v1/organizations/org-a/usage?month=2026-09")
    assert resp.status_code == 200 and usage.await_args.args[1] == "2026-09"
    assert as_user("admin1").get("/api/v1/organizations/org-a/usage?month=eylul").status_code == 422


def test_report_pdf_instructor_has_no_usage_admin_has(as_user, monkeypatch, report_mocks):
    roles = {("org-a", "admin1"): "org_admin", ("org-a", "teacher"): "instructor", ("org-a", "s1"): "candidate"}
    monkeypatch.setattr(organization_service, "get_membership",
                        AsyncMock(side_effect=lambda org, uid: {"role": roles[(org, uid)]} if (org, uid) in roles else None))
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value={"id": "org-a", "name": "Ege", "rubric": None}))
    audit = AsyncMock(return_value=None)
    monkeypatch.setattr(organization_service, "log_audit", audit)

    assert as_user("s1").get("/api/v1/organizations/org-a/report.pdf").status_code == 403

    resp = as_user("teacher").get("/api/v1/organizations/org-a/report.pdf")
    assert resp.status_code == 200 and resp.headers["content-type"] == "application/pdf"
    assert "Yapay zekâ kullanımı" not in _text(resp.content)
    report_mocks.assert_not_awaited()

    resp = as_user("admin1").get("/api/v1/organizations/org-a/report.pdf")
    assert "Yapay zekâ kullanımı" in _text(resp.content)
    assert audit.await_args.args[2] == "export.report"


def test_group_report_lists_only_group_assignments(as_user, monkeypatch, report_mocks):
    monkeypatch.setattr(organization_service, "get_membership", AsyncMock(return_value={"role": "instructor"}))
    monkeypatch.setattr(organization_service, "get_organization", AsyncMock(return_value={"id": "org-a", "name": "Ege", "rubric": None}))
    text = _text(as_user("teacher").get("/api/v1/organizations/org-a/report.pdf?group_id=g1").content)
    assert "Grup: A Şubesi" in text and "A grubu ödevi" in text and "Kurum geneli" not in text
    assert as_user("teacher").get("/api/v1/organizations/org-a/report.pdf?group_id=yok").status_code == 404
