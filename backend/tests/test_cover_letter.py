"""
Ön yazı üretici: modele giden veri (iletişim yok, ad yok), dürüstlük denetimi,
mektubun birleştirilmesi, sahiplik ve HTTP hataları. Gerçek Supabase/LLM çağrısı yapılmaz.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_cover_letter.py -v
"""
import asyncio
from unittest.mock import AsyncMock

import pytest

from app.services import cover_letter_service as cl
from app.services import cv_service, job_service
from app.services.llm_service import llm_service

from test_jobs import api, _job  # noqa: F401

PROFILE = {
    "full_name": "Ece Deneme",
    "email": "ece@example.com",
    "phone": "+90 555 111 22 33",
    "summary": "Frontend geliştirici. İletişim: ece@example.com",
    "skills": ["React.js", "TypeScript", "Node.js"],
    "experience": [{"company": "Lumen", "title": "Stajyer", "start": "2024", "end": "2025",
                    "bullets": ["Sayfa yüklenme süresini %35 azalttım", "<script>alert(1)</script> bileşen kütüphanesi"]}],
    "projects": [{"name": "Bilet", "description": "Etkinlik bileti uygulaması", "tech": ["Next.js"]}],
    "education": [{"school": "Ege Üniversitesi", "degree": "Lisans", "field": "Bilgisayar Mühendisliği", "end": "2025"}],
    "languages": ["İngilizce (B2)"],
}
CV_TEXT = "Ece Deneme ece@example.com Lumen stajyer 2024-2025. Sayfa yüklenme süresini %35 azalttım."
REQS = {"title": "Frontend Developer", "company": "Lumen Yazılım",
        "required_skills": ["React", "TypeScript", "Docker", "GraphQL"], "nice_to_have_skills": ["Next.js", "AWS"]}

LLM_OK = {
    "subject": "Frontend Developer başvurusu",
    "paragraphs": [
        "Lumen Yazılım'daki Frontend Developer pozisyonuna büyük ilgiyle başvuruyorum.",
        "Stajımda sayfa yüklenme süresini %35 azalttım; React ve TypeScript ile bileşenler geliştirdim.",
        "Ekibinizle görüşme fırsatı bulmak isterim.",
    ],
    "highlighted_skills": ["React", "TypeScript", "Kubernetes"],
}


def _mocks(monkeypatch, llm=LLM_OK, profile=PROFILE):
    monkeypatch.setattr(job_service, "get_job", AsyncMock(return_value=_job(REQS)))
    monkeypatch.setattr(cv_service, "get_cv", AsyncMock(return_value={"id": "cv-1", "profile": profile, "extracted_text": CV_TEXT}))
    gen = AsyncMock(return_value=llm)
    monkeypatch.setattr(llm_service, "generate_json", gen)
    return gen


# --- modele giden veri ---

def test_cv_facts_exclude_name_and_contact_and_brackets():
    facts = cl.build_cv_facts(PROFILE)
    assert "Ece Deneme" not in facts and "ece@example.com" not in facts and "555" not in facts
    assert "<" not in facts and ">" not in facts
    assert "%35" in facts and "Stajyer · Lumen · 2024 - 2025" in facts and "Next.js" in facts


def test_prompt_gets_matched_and_missing_skills(monkeypatch):
    gen = _mocks(monkeypatch)
    asyncio.run(cl.generate("user-a", "job-1", "cv-1", note="Bilet projemi vurgula"))
    user_msg = gen.await_args.args[1]
    assert "<eksik_beceriler>Docker, GraphQL, AWS</eksik_beceriler>" in user_msg
    assert "React" in user_msg.split("<eslesen_beceriler>")[1].split("</eslesen_beceriler>")[0]
    assert "<aday_notu>Bilet projemi vurgula</aday_notu>" in user_msg
    assert gen.await_args.kwargs["purpose"] == "cover_letter"
    assert gen.await_args.kwargs["attempt_timeout"] == cl.ATTEMPT_TIMEOUT


# --- birleştirme ---

def test_letter_assembled_with_greeting_closing_and_name(monkeypatch):
    _mocks(monkeypatch)
    out = asyncio.run(cl.generate("user-a", "job-1", "cv-1"))
    assert out["body"].startswith("Sayın İşe Alım Ekibi,\n\nLumen Yazılım'daki")
    assert out["body"].endswith("Saygılarımla,\nEce Deneme")
    assert out["subject"] == "Frontend Developer başvurusu" and out["word_count"] > 20
    # CV'de olmayan beceri "öne çıkarılan" olarak dönmez.
    assert out["highlighted_skills"] == ["React", "TypeScript"]


def test_english_letter_and_name_placeholder(monkeypatch):
    _mocks(monkeypatch, profile={**PROFILE, "full_name": None})
    out = asyncio.run(cl.generate("user-a", "job-1", "cv-1", language="en", tone="samimi"))
    assert out["body"].startswith("Dear Hiring Team,") and out["body"].endswith("Kind regards,\n[Your Name]")
    assert "İNGİLİZCE" in llm_service.generate_json.await_args.args[0]


def test_contact_info_in_model_output_is_masked(monkeypatch):
    llm = {**LLM_OK, "paragraphs": LLM_OK["paragraphs"] + ["Bana ece@example.com adresinden ulaşabilirsiniz."]}
    _mocks(monkeypatch, llm=llm)
    assert "ece@example.com" not in asyncio.run(cl.generate("user-a", "job-1", "cv-1"))["body"]


def test_too_short_output_is_an_error(monkeypatch):
    _mocks(monkeypatch, llm={"paragraphs": ["Tek paragraf."]})
    with pytest.raises(RuntimeError):
        asyncio.run(cl.generate("user-a", "job-1", "cv-1"))


# --- dürüstlük denetimi ---

def test_supported_numbers_and_matched_skills_give_no_warning(monkeypatch):
    _mocks(monkeypatch)
    assert asyncio.run(cl.generate("user-a", "job-1", "cv-1"))["warnings"] == []


def test_invented_number_and_missing_skill_are_flagged():
    letter = "Docker ile 12 mikroservisi yönettim ve maliyeti %40 düşürdüm. React biliyorum."
    warnings = cl.honesty_warnings(letter, CV_TEXT, PROFILE, ["Docker", "GraphQL"])
    assert len(warnings) == 2
    assert "12, 40" in warnings[0]
    assert "Docker" in warnings[1] and "GraphQL" not in warnings[1]


@pytest.mark.parametrize("cv,letter", [
    ("30 bin aylık aktif kullanıcı", "30,000 monthly users"),
    ("30 bin aylık aktif kullanıcı", "30.000 aylık kullanıcı"),
    ("2,5 milyon istek", "2.5 million requests"),
    ("%45 azalttım", "45% faster"),
])
def test_same_number_in_other_format_is_not_flagged(cv, letter):
    # Canlıda: CV "30 bin", mektup "30,000" -> yanlış alarm veriyordu.
    assert cl.honesty_warnings(letter, cv, {}, []) == []


def test_acronyms_not_in_cv_are_flagged():
    # Canlıda: CV'de olmayan "WCAG yönergelerine uygun çözümler üretme deneyimim var" yakalanmıyordu.
    letter = "React ile çalıştım; WCAG uyumlu arayüzler ve REST API entegrasyonu yaptım. Lumen UI ekibine katılmak isterim."
    warnings = cl.honesty_warnings(letter, "React REST API Next.js", {}, [], exempt="Lumen UI Developer")
    assert warnings == ["CV'nizde geçmeyen ifadeler: WCAG. Bu konularda deneyiminiz yoksa mektuptan çıkarın."]


def test_generic_terms_are_not_flagged():
    assert cl.honesty_warnings("REST API ve UI geliştirme, UX odaklı çalışma.", "React REST", {}, []) == []


def test_missing_skill_is_not_reported_twice_as_acronym():
    warnings = cl.honesty_warnings("AWS üzerinde çalıştım.", "", {}, ["AWS"])
    assert len(warnings) == 1 and "AWS" in warnings[0]


@pytest.mark.parametrize("text,expected", [
    ("Birinci cümle. Özellikle kullanıcı deneyimini ön planda tutan projelerde", "Birinci cümle."),
    ("Tam cümle.", "Tam cümle."),
    ("Tek parça yarım cümle", "Tek parça yarım cümle"),  # kesecek yer yoksa olduğu gibi kalır
    ("Görüşmek isterim!", "Görüşmek isterim!"),
])
def test_dangling_sentence_is_trimmed(text, expected):
    assert cl.trim_dangling(text) == expected


def test_short_missing_skill_is_found_as_word():
    assert cl.honesty_warnings("Go ile servis yazdım.", "", {}, ["Go"])
    assert not cl.honesty_warnings("Ekibe katkı sağlamak için gönüllüyüm.", "", {}, ["Go"])


# --- sahiplik ve HTTP ---

def test_requires_owned_job_and_analyzed_cv(monkeypatch):
    monkeypatch.setattr(job_service, "get_job", AsyncMock(return_value=None))
    with pytest.raises(LookupError):
        asyncio.run(cl.generate("user-a", "job-of-b", "cv-1"))
    monkeypatch.setattr(job_service, "get_job", AsyncMock(return_value=_job(REQS)))
    monkeypatch.setattr(cv_service, "get_cv", AsyncMock(return_value={"id": "cv-1", "profile": None}))
    with pytest.raises(PermissionError):
        asyncio.run(cl.generate("user-a", "job-1", "cv-1"))


def test_http_ok_and_errors(api, monkeypatch):
    _mocks(monkeypatch)
    resp = api.post("/api/v1/jobs/job-1/cover-letter", json={"cv_id": "cv-1", "tone": "samimi"})
    assert resp.status_code == 200 and resp.json()["tone"] == "samimi"

    assert api.post("/api/v1/jobs/job-1/cover-letter", json={"cv_id": "cv-1", "language": "de"}).status_code == 422
    assert api.post("/api/v1/jobs/job-1/cover-letter", json={"cv_id": "cv-1", "note": "x" * 501}).status_code == 422

    monkeypatch.setattr(job_service, "get_job", AsyncMock(return_value=None))
    assert api.post("/api/v1/jobs/job-x/cover-letter", json={"cv_id": "cv-1"}).status_code == 404

    _mocks(monkeypatch)
    monkeypatch.setattr(llm_service, "generate_json", AsyncMock(side_effect=RuntimeError("tüm modeller düştü")))
    resp = api.post("/api/v1/jobs/job-1/cover-letter", json={"cv_id": "cv-1"})
    assert resp.status_code == 503 and "hazırlanamadı" in resp.json()["detail"]
