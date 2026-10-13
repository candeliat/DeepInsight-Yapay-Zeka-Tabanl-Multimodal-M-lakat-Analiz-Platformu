"""
Video analizi kuyruğu ve kare örnekleme: aynı anda en fazla N analiz, sıradakine konum,
dolu kuyrukta 503, yeniden başlatmada yarıda kalanlar "failed"; uzun videoda bellek sınırlı.
Gerçek DeepFace/Whisper/Supabase yok.
"""
import os
import threading
import time
import uuid
from unittest.mock import MagicMock

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import app.api.routes.analytics as analytics_route
from app.api.dependencies.auth import get_current_user, oauth2_scheme
from app.api.schemas.user import UserProfile
from app.core.config import settings
from app.main import app
from app.services import analysis_queue, analytics
from app.services.analytics import VideoAnalyzer

# conftest açılış kurtarmasını testlerde etkisizleştiriyor; burada asıl fonksiyon sınanır.
REAL_RECOVER = analysis_queue.recover_after_restart


@pytest.fixture
def queue(monkeypatch):
    """Tek işçili, kendi durumu olan bir kuyruk; analiz `release` olayına kadar bekler."""
    from concurrent.futures import ThreadPoolExecutor

    monkeypatch.setattr(analysis_queue, "_executor", ThreadPoolExecutor(max_workers=1))
    monkeypatch.setattr(analysis_queue, "_waiting", [])
    monkeypatch.setattr(analysis_queue, "_running", set())
    statuses = []
    monkeypatch.setattr(analytics, "_update_analysis_status", lambda iid, st, err=None: statuses.append((iid, st)))
    release, started, finished = threading.Event(), [], []

    def fake_run(file_path, interview_id, file_type):
        started.append(interview_id)
        release.wait(5)
        finished.append(interview_id)

    monkeypatch.setattr(analytics, "run_full_analysis", fake_run)
    yield MagicMock(release=release, started=started, finished=finished, statuses=statuses)
    release.set()
    analysis_queue._executor.shutdown(wait=True)


def _wait(cond, timeout=3.0):
    end = time.monotonic() + timeout
    while not cond() and time.monotonic() < end:
        time.sleep(0.01)
    assert cond()


def test_jobs_run_one_at_a_time_and_waiting_jobs_know_their_position(queue):
    assert analysis_queue.submit("a.webm", "i1", "video") == 0
    _wait(lambda: queue.started == ["i1"])
    assert analysis_queue.submit("b.webm", "i2", "video") == 1
    assert analysis_queue.submit("c.webm", "i3", "video") == 2
    assert (analysis_queue.position("i1"), analysis_queue.position("i2"), analysis_queue.position("i3")) == (None, 1, 2)
    assert queue.statuses == [("i1", "processing"), ("i2", "queued"), ("i3", "queued")]
    time.sleep(0.1)
    assert queue.started == ["i1"]  # ikinci analiz birincisi bitmeden başlamaz

    queue.release.set()
    _wait(lambda: queue.finished == ["i1", "i2", "i3"])
    assert analysis_queue.position("i3") is None


def test_full_queue_and_duplicate_submission_are_rejected(queue, monkeypatch):
    monkeypatch.setattr(settings, "ANALYSIS_MAX_QUEUE", 1)
    analysis_queue.submit("a.webm", "i1", "video")
    _wait(lambda: queue.started == ["i1"])
    analysis_queue.submit("b.webm", "i2", "video")
    with pytest.raises(analysis_queue.AlreadyQueued):
        analysis_queue.submit("b.webm", "i2", "video")
    with pytest.raises(analysis_queue.QueueFull):
        analysis_queue.submit("c.webm", "i3", "video")


def test_recover_after_restart_fails_stale_jobs_and_deletes_leftover_uploads(monkeypatch, tmp_path):
    (tmp_path / "eski.webm").write_bytes(b"x")
    monkeypatch.setattr(settings, "TEMP_UPLOAD_DIR", str(tmp_path))
    fake = MagicMock()
    fake.table.return_value.update.return_value.in_.return_value.execute.return_value = MagicMock(data=[{}, {}])
    monkeypatch.setattr("app.core.database.sync_supabase", fake)

    assert REAL_RECOVER() == 2
    update = fake.table.return_value.update
    assert update.call_args.args[0]["analysis_status"] == "failed"
    update.return_value.in_.assert_called_with("analysis_status", ["queued", "processing"])
    assert list(tmp_path.iterdir()) == []


# --- HTTP ---

INTERVIEW_ID = str(uuid.uuid4())


@pytest.fixture
def client(monkeypatch, tmp_path):
    me = UserProfile(id="user-1", email="u@example.com", created_at="2026-01-01", user_metadata={}, app_metadata={})
    app.dependency_overrides[oauth2_scheme] = lambda: "t"
    app.dependency_overrides[get_current_user] = lambda: me
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"user_id": "user-1", "interview_id": INTERVIEW_ID, "analysis_status": "queued"}])
    monkeypatch.setattr(analytics_route, "supabase", db)
    monkeypatch.setattr(analytics_route.account_service, "has_video_consent", lambda uid: True)
    monkeypatch.setattr(settings, "TEMP_UPLOAD_DIR", str(tmp_path))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_upload_reports_queue_position(client, monkeypatch):
    monkeypatch.setattr(analysis_queue, "submit", lambda *a: 2)
    body = client.post(f"/api/v1/analytics/analyze/{INTERVIEW_ID}", files={"file": ("a.webm", b"x", "video/webm")}).json()
    assert body["status"] == "queued" and body["queue_position"] == 2 and "önünüzde 2 analiz" in body["message"]


def test_full_queue_returns_503_and_deletes_the_upload(client, monkeypatch, tmp_path):
    def full(*a):
        raise analysis_queue.QueueFull

    monkeypatch.setattr(analysis_queue, "submit", full)
    resp = client.post(f"/api/v1/analytics/analyze/{INTERVIEW_ID}", files={"file": ("a.webm", b"x", "video/webm")})
    assert resp.status_code == 503
    assert list(tmp_path.iterdir()) == []  # kişisel veri içeren video diskte kalmaz


def test_status_includes_queue_position_and_results_wait_while_queued(client, monkeypatch):
    monkeypatch.setattr(analysis_queue, "position", lambda iid: 3)
    status = client.get(f"/api/v1/analytics/status/{INTERVIEW_ID}").json()
    assert status["analysis_status"] == "queued" and status["queue_position"] == 3
    assert client.get(f"/api/v1/analytics/results/{INTERVIEW_ID}").status_code == 202


# --- kare örnekleme ---

def _video(path, seconds, fps=10, size=(1280, 720)):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, size)
    for i in range(seconds * fps):
        frame = np.full((size[1], size[0], 3), int(250 * i / (seconds * fps)), dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return str(path)


def test_frames_are_downscaled_and_sampled_per_second(tmp_path):
    frames = VideoAnalyzer.extract_frames(_video(tmp_path / "v.avi", seconds=12), fps=1, max_frames=300, max_width=640)
    assert 11 <= len(frames) <= 13
    assert frames[0].shape[:2] == (360, 640)


def test_long_video_keeps_at_most_max_frames_spread_over_whole_duration(tmp_path):
    frames = VideoAnalyzer.extract_frames(_video(tmp_path / "v.avi", seconds=40, size=(320, 240)), fps=1, max_frames=10, max_width=640)
    assert 5 <= len(frames) <= 10
    # Son kare videonun sonlarından gelir (yalnızca ilk 10 saniye değil): renk kare sırasını kodluyor.
    assert frames[-1][0, 0, 0] > frames[len(frames) // 2][0, 0, 0] > frames[0][0, 0, 0]
