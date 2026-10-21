"""
Video analizinin çalışma ortamına bağlı kırılmaları (canlıda 2026-10-21 görüldü):
- DeepFace varsayılan yüz bulucusu OpenCV 5'te olmayan haarcascade dosyasına dayanıyordu → mtcnn.
- Whisper'a dosya yolu verilince PATH'te "ffmpeg" arıyordu (Windows'ta yok) → sesi kendimiz çözüyoruz.
DeepFace/Whisper/ffmpeg CI'de kurulu değil; hepsi taklit edilir.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_analysis_runtime.py -v
"""
import sys
import types
from types import SimpleNamespace

import numpy as np

from app.services import analytics, whisper_service


def test_emotion_analysis_uses_detector_that_needs_no_haarcascade(monkeypatch):
    calls = []

    def analyze(**kwargs):
        calls.append(kwargs)
        return [{"emotion": {"neutral": 80.0, "sad": 20.0}}]

    monkeypatch.setitem(sys.modules, "deepface", types.SimpleNamespace(DeepFace=SimpleNamespace(analyze=analyze)))
    result = analytics.VideoAnalyzer.analyze_emotions([np.zeros((4, 4, 3), np.uint8)] * 2)

    assert analytics.EMOTION_FACE_DETECTOR == "mtcnn"
    assert [c["detector_backend"] for c in calls] == ["mtcnn", "mtcnn"]
    assert result["dominant"] == "neutral"


def test_load_audio_decodes_with_project_ffmpeg_when_not_on_path(monkeypatch):
    seen = {}

    def run(cmd, **kwargs):
        seen["cmd"] = cmd
        return SimpleNamespace(stdout=np.array([0, 16384, -32768], np.int16).tobytes())

    monkeypatch.setattr(whisper_service.shutil, "which", lambda name: None)
    monkeypatch.setitem(sys.modules, "imageio_ffmpeg", types.SimpleNamespace(get_ffmpeg_exe=lambda: "C:/x/ffmpeg-win.exe"))
    monkeypatch.setattr(whisper_service.subprocess, "run", run)

    audio = whisper_service.load_audio("kayit.wav")

    assert seen["cmd"][0] == "C:/x/ffmpeg-win.exe"
    assert seen["cmd"][seen["cmd"].index("-ar") + 1] == "16000"
    assert audio.dtype == np.float32
    assert audio.tolist() == [0.0, 0.5, -1.0]


def test_transcribe_passes_decoded_audio_not_path(monkeypatch):
    received = {}

    class Model:
        def transcribe(self, audio, **kwargs):
            received["audio"] = audio
            return {"text": " merhaba ", "segments": [{"end": 2.5}]}

    decoded = np.zeros(16000, np.float32)
    monkeypatch.setattr(whisper_service, "get_whisper_model", lambda: Model())
    monkeypatch.setattr(whisper_service, "load_audio", lambda path: decoded)

    out = analytics.AudioAnalyzer.transcribe("kayit.wav", "tr")

    assert received["audio"] is decoded
    assert out["text"] == "merhaba" and out["duration"] == 2.5
