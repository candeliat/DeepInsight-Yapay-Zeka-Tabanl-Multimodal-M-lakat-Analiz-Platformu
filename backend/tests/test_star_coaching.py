"""
STAR koçluğu: davranışsal mülakatta her cevabın kural tabanlı STAR analizi, akışta `star`
olayı olarak gönderilmesi ve mesajla saklanması; değerlendirme promptunda STAR ölçütü.
"""
from unittest.mock import AsyncMock

import app.api.routes.interview as interview_route
from app.services import star_service
from app.services.llm_service import llm_service
from app.services.prompts.interview_v1 import build_evaluation_prompt

from test_interview_chat_flow import client, _history_with_n_questions_asked, _mock_interview_service, _parse_sse_events  # noqa: F401

STRONG = (
    "Geçen yıl stajımda çalıştığım ekipte ödeme servisi sık sık çöküyordu. Benden bu sorunu bir hafta "
    "içinde çözmem bekleniyordu. Önce logları inceledim, hatanın bağlantı havuzundan kaynaklandığını buldum. "
    "Havuz ayarlarını düzelttim, yeniden deneme mekanizması ekledim ve bir izleme paneli kurdum. Sonuç olarak "
    "hata oranı yüzde 90 azaldı ve yanıt süresi 300 ms kısaldı. Bu süreçte kök neden analizinin önemini "
    "öğrendim ve aynı yaklaşımı sonraki projelerde de kullandım, ekip de paneli standart hale getirdi."
)
WE_ONLY = (
    "Bir projede müşteri teslim tarihini öne çekti, hedefimiz iki haftada bitirmekti. Ekipçe planı "
    "yeniden yaptık, görevleri böldük, fazla mesai yaptık ve sonunda projeyi zamanında teslim ettik."
)


def test_complete_star_answer_gets_full_score_and_no_tips():
    a = star_service.analyze_answer(STRONG)
    assert a["components"] == {"situation": True, "task": True, "action": True, "result": True}
    assert a["score"] == 100 and a["voice"] == "ben" and a["quantified_result"] and a["tips"] == []


def test_we_language_and_unquantified_result_are_coached_action_first():
    a = star_service.analyze_answer(WE_ONLY)
    assert a["voice"] == "biz"
    assert a["components"]["situation"] and a["components"]["task"] and a["components"]["result"]
    assert not a["quantified_result"]
    assert "ben" in a["tips"][0]  # en önemli ipucu: kendi katkın
    assert any("rakam" in t for t in a["tips"])


def test_vague_short_answer_lists_at_most_three_tips():
    a = star_service.analyze_answer("Genelde iletişime önem veririm.")
    assert a["score"] == 0 and len(a["tips"]) == 3


def test_summary_finds_the_most_often_missing_component():
    analyses = [star_service.analyze_answer(STRONG), star_service.analyze_answer(WE_ONLY)]
    summary = star_service.summarize(analyses)
    assert summary["answers"] == 2 and summary["coverage"]["action"] == 1 and summary["weakest"] == "action"
    assert star_service.summarize([])["average"] is None


def test_only_behavioral_topics_are_coached():
    assert star_service.is_behavioral("Davranışsal mülakat (STAR)")
    assert star_service.is_behavioral("Behavioral")
    assert not star_service.is_behavioral("Python")


def _behavioral(monkeypatch, topic="Davranışsal mülakat (STAR)"):
    _mock_interview_service(monkeypatch, _history_with_n_questions_asked(1))
    interview_route.get_interview.return_value = {"user_id": "user-1", "role": "Backend", "topic": topic, "status": "ongoing"}

    async def next_question(*args, **kwargs):
        yield "Peki, bir anlaşmazlığı nasıl çözdüğünü anlatır mısın?"

    monkeypatch.setattr(llm_service, "stream_next_question", next_question)


def _events(client, message):
    with client.stream("POST", "/api/v1/interview/chat/stream", json={"interview_id": "interview-1", "message": message}) as resp:
        return _parse_sse_events("".join(resp.iter_text()))


def test_behavioral_answer_gets_star_event_first_and_is_saved_with_coaching(client, monkeypatch):
    _behavioral(monkeypatch)
    events = _events(client, WE_ONLY)
    assert events[0][0] == "star" and events[0][1]["voice"] == "biz"
    assert events[-1][0] == "done"
    user_save = next(c for c in interview_route.save_message.await_args_list if c.kwargs.get("role") == "user")
    assert user_save.kwargs["coaching"]["components"]["task"] is True


def test_technical_interview_has_no_star_event(client, monkeypatch):
    _behavioral(monkeypatch, topic="Python")
    events = _events(client, "GIL tek seferde bir iş parçacığının bytecode çalıştırmasını sağlar.")
    assert all(name != "star" for name, _ in events)
    user_save = next(c for c in interview_route.save_message.await_args_list if c.kwargs.get("role") == "user")
    assert user_save.kwargs.get("coaching") is None


def test_final_evaluation_of_behavioral_interview_uses_star_rubric():
    assert "STAR" in build_evaluation_prompt("Backend", "Davranışsal mülakat (STAR)")
    assert "DAVRANIŞSAL" not in build_evaluation_prompt("Backend", "Python")
