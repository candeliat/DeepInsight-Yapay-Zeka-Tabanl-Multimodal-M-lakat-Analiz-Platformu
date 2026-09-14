"""
`GET /api/v1/interview/me` ve `GET /api/v1/interview/{id}` uç noktaları için
"özgüven skoru uzlaştırma" testleri.

Bağlam: iki farklı özgüven sinyali var — `confidence_score` (LLM'in salt
metne dayalı SÜBJEKTİF tahmini, `interviews` tablosunda) ve `confidence_pct`
(video/ses analizinden gelen OBJEKTİF skor, `interview_analytics` tablosunda,
yalnızca analiz tamamlandıysa mevcut). `average_score` hesaplanırken, analiz
tamamlanmışsa OBJEKTİF skor tercih edilmeli — aksi halde liste ekranındaki
ortalama ile detay ekranındaki (chat sonuç ekranı, interviews/[id]) "Özgüven"
göstergesi birbirinden farklı görünür (bkz. proje notları).
"""
from unittest.mock import AsyncMock

import app.api.routes.interview as interview_route

from test_interview_chat_flow import client  # noqa: F401


def _interview(**overrides):
    base = {
        "id": "interview-1",
        "user_id": "user-1",
        "role": "Backend Developer",
        "topic": "Python",
        "status": "completed",
        "technical_score": 80,
        "confidence_score": 50,
        "vocabulary_score": 70,
        "created_at": "2026-01-01T00:00:00Z",
    }
    base.update(overrides)
    return base


def test_my_interviews_uses_objective_confidence_when_analysis_completed(client, monkeypatch):
    monkeypatch.setattr(interview_route, "get_user_interviews", AsyncMock(return_value=[_interview()]))
    monkeypatch.setattr(
        interview_route, "get_completed_confidence_map",
        AsyncMock(return_value={"interview-1": 90.0}),
    )

    resp = client.get("/api/v1/interview/me")

    assert resp.status_code == 200
    body = resp.json()[0]
    assert body["objective_confidence_pct"] == 90.0
    # (80 + 90 + 70) / 3 = 80.0 -- confidence_score(50) DEĞİL, confidence_pct(90) kullanılmalı.
    assert body["average_score"] == 80.0


def test_my_interviews_falls_back_to_llm_confidence_when_analysis_missing(client, monkeypatch):
    monkeypatch.setattr(interview_route, "get_user_interviews", AsyncMock(return_value=[_interview()]))
    monkeypatch.setattr(interview_route, "get_completed_confidence_map", AsyncMock(return_value={}))

    resp = client.get("/api/v1/interview/me")

    assert resp.status_code == 200
    body = resp.json()[0]
    assert body["objective_confidence_pct"] is None
    # (80 + 50 + 70) / 3 = 66.7 -- analiz yokken LLM'in confidence_score'una düşülmeli.
    assert body["average_score"] == 66.7


def test_interview_detail_uses_objective_confidence_when_analysis_completed(client, monkeypatch):
    monkeypatch.setattr(interview_route, "get_interview", AsyncMock(return_value=_interview()))
    monkeypatch.setattr(interview_route, "get_interview_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        interview_route, "get_completed_confidence_map",
        AsyncMock(return_value={"interview-1": 90.0}),
    )

    resp = client.get("/api/v1/interview/interview-1")

    assert resp.status_code == 200
    body = resp.json()
    assert body["objective_confidence_pct"] == 90.0
    assert body["average_score"] == 80.0
