"""
Yerel embedding modeli soğukken istek yolu beklemez: embed_text_local_if_ready None döner
ve yüklemeyi tek bir arka plan iş parçacığında başlatır; model yüklenince normal çalışır.
"""
import threading
from unittest.mock import MagicMock

import app.services.local_embedding_service as svc


def test_cold_model_returns_none_and_warms_once(monkeypatch):
    monkeypatch.setattr(svc, "_model", None)
    monkeypatch.setattr(svc, "_warming", False)
    release = threading.Event()
    loads = []

    def slow_load():
        loads.append(1)
        release.wait(5)
        svc._model = MagicMock(encode=MagicMock(return_value=MagicMock(tolist=lambda: [0.5])))
        return svc._model

    monkeypatch.setattr(svc, "get_local_embedding_model", slow_load)
    assert svc.embed_text_local_if_ready("soru", "passage") is None
    assert svc.embed_text_local_if_ready("soru", "passage") is None  # ikinci çağrı yeni yükleme başlatmaz
    release.set()
    for t in threading.enumerate():
        if t.name == "local-embedding-warmup":
            t.join(5)
    assert loads == [1]

    monkeypatch.setattr(svc, "get_local_embedding_model", lambda: svc._model)
    assert svc.embed_text_local_if_ready("soru", "passage") == [0.5]
    svc._model.encode.assert_called_once_with("passage: soru", normalize_embeddings=True)
