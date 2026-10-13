import pytest

from app.services import analysis_queue


@pytest.fixture(autouse=True)
def _no_startup_recovery(monkeypatch):
    """`with TestClient(app)` uygulamanın açılış adımını çalıştırır; o adım gerçek veritabanında
    yarıda kalan analizleri "failed" yapıp temp_uploads'u boşaltır. Testlerde asla çalışmamalı."""
    monkeypatch.setattr(analysis_queue, "recover_after_restart", lambda: 0)
