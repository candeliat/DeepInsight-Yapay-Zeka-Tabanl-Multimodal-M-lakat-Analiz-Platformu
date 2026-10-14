"""
İngilizce mülakat modu: prompt dili, /start ve /transcribe bağlantısı, İngilizce STAR işaretleri,
İngilizce dolgu kelimeleri. Gerçek Supabase/LLM/Whisper çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_english_mode.py -v
"""
from unittest.mock import AsyncMock

import app.api.routes.interview as interview_route
from app.services import analytics, star_service
from app.services.analytics import AudioAnalyzer
from app.services.llm_service import llm_service
from app.services.prompts.interview_v1 import (
    build_evaluation_prompt,
    build_question_delivery_prompt,
    build_question_prompt,
)

from test_interview_chat_flow import client, _mock_interview_service  # noqa: F401


# --- promptlar ---

def test_turkish_prompts_are_unchanged_by_default():
    assert "Sorularını Türkçe sor." in build_question_prompt("Backend", "Python", 2, 5)
    assert "Türkçe yaz." in build_question_delivery_prompt("Backend", "Python", 2, 5, "GIL nedir?")
    assert "İNGİLİZCE" not in build_evaluation_prompt("Backend", "Python")


def test_english_prompts_ask_in_english_and_translate_bank_question():
    question = build_question_prompt("Backend", "Python", 2, 5, language="en")
    assert "İNGİLİZCE" in question and "Sorularını Türkçe sor." not in question
    delivery = build_question_delivery_prompt("Backend", "Python", 2, 5, "GIL nedir?", language="en")
    assert "İngilizceye çevirerek" in delivery and "Türkçe yaz." not in delivery


def test_english_evaluation_scores_english_but_feedback_stays_turkish():
    prompt = build_evaluation_prompt("Backend", "Python", language="en")
    assert "İngilizce iş iletişimini" in prompt and "feedback'i\nyine Türkçe yaz" in prompt


# --- /start ---

def _start_mocks(monkeypatch):
    monkeypatch.setattr(interview_route.question_bank_service, "fetch_question_pool", AsyncMock(return_value=[]))
    create = AsyncMock(return_value={"id": "interview-1"})
    monkeypatch.setattr(interview_route, "create_interview", create)
    monkeypatch.setattr(interview_route, "save_message", AsyncMock(return_value={}))
    get_next = AsyncMock(return_value="Hello!")
    monkeypatch.setattr(llm_service, "get_next_question", get_next)
    return create, get_next


def test_start_in_english_stores_and_uses_language(client, monkeypatch):
    create, get_next = _start_mocks(monkeypatch)
    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "language": "en"})
    assert resp.status_code == 200
    assert create.await_args.kwargs["language"] == "en"
    assert get_next.await_args.kwargs["language"] == "en"


def test_start_defaults_to_turkish(client, monkeypatch):
    create, get_next = _start_mocks(monkeypatch)
    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python"})
    assert resp.status_code == 200
    assert create.await_args.kwargs["language"] == "tr"
    assert get_next.await_args.kwargs["language"] == "tr"


def test_start_rejects_unknown_language(client, monkeypatch):
    create, _ = _start_mocks(monkeypatch)
    resp = client.post("/api/v1/interview/start", json={"role": "Backend", "topic": "Python", "language": "de"})
    assert resp.status_code == 422
    create.assert_not_awaited()


# --- /transcribe ---

def test_transcribe_passes_english(client, monkeypatch):
    transcribe = AsyncMock(return_value="I designed the API.")
    monkeypatch.setattr(llm_service, "transcribe_audio", transcribe)
    resp = client.post(
        "/api/v1/interview/transcribe",
        files={"file": ("a.m4a", b"abc", "audio/m4a")},
        data={"language": "en"},
    )
    assert resp.status_code == 200 and resp.json() == {"text": "I designed the API."}
    assert transcribe.await_args.args[2] == "en"


def test_transcribe_defaults_to_turkish_and_ignores_unknown(client, monkeypatch):
    transcribe = AsyncMock(return_value="metin")
    monkeypatch.setattr(llm_service, "transcribe_audio", transcribe)
    client.post("/api/v1/interview/transcribe", files={"file": ("a.m4a", b"abc", "audio/m4a")})
    assert transcribe.await_args.args[2] == "tr"
    client.post("/api/v1/interview/transcribe", files={"file": ("a.m4a", b"abc", "audio/m4a")}, data={"language": "xx"})
    assert transcribe.await_args.args[2] == "tr"


# --- STAR (İngilizce) ---

FULL_EN = (
    "During my internship at a fintech company our team had a tight deadline. My task was to fix a slow "
    "report. I profiled the queries, I added an index and I rewrote the cache layer. As a result the "
    "report time was reduced by 70 percent."
)


def test_english_star_full_answer():
    star = star_service.analyze_answer(FULL_EN, "en")
    assert star["components"] == {"situation": True, "task": True, "action": True, "result": True}
    assert star["voice"] == "ben" and star["quantified_result"] is True


def test_english_star_we_answer_gets_i_tip():
    star = star_service.analyze_answer("We had a project, we discussed it and we finished it.", "en")
    assert star["components"]["action"] is False and star["voice"] == "biz"
    assert "'I designed" in star["tips"][0]


def test_english_answer_scored_with_turkish_cues_misses_components():
    # Dil yanlış seçilirse işaretler tutmaz — bu yüzden dil mülakat kaydından okunur.
    assert star_service.analyze_answer(FULL_EN)["components"]["action"] is False


# --- video analizi ---

def test_english_filler_words():
    result = AudioAnalyzer.count_filler_words("Umm so I mean, uh, I basically like ermm did it", "en")
    assert result["detail"] == {"um": 1, "i mean": 1, "uh": 2, "basically": 1, "like": 1}


def test_turkish_filler_words_unchanged():
    assert AudioAnalyzer.count_filler_words("eee yani şey işte")["total"] == 4


def test_interview_language_falls_back_to_turkish(monkeypatch):
    class Broken:
        def table(self, *_):
            raise RuntimeError("db down")

    import app.core.database as database
    monkeypatch.setattr(database, "sync_supabase", Broken())
    assert analytics._interview_language("int-1") == "tr"
