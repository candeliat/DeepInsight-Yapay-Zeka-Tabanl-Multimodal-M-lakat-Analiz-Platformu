"""
OCR çıktısına dayanıklılık: akademik ölçümde (scripts/eval/eval_ats_robustness.py)
taranmış CV'lerin tarih ve e-posta kontrollerinde haksız puan kaybettiği ve
OCR'ın bozduğu e-postanın LLM'e maskelenmeden gittiği bulundu.
"""
from app.services import ats_service


def test_ocr_spaced_email_is_found_and_normalized():
    text = "Deniz Yılmaz deniz .yilmaz@example. com +90 555 010 20 30"
    assert ats_service.find_contact(text)["email"] == "deniz.yilmaz@example.com"


def test_ocr_spaced_email_is_masked_before_llm():
    masked = ats_service.mask_contact("İletişim: deniz .yilmaz@example. com, tel +90 555 010 20 30")
    assert "yilmaz" not in masked and "[E-POSTA]" in masked and "[TELEFON]" in masked


def test_normal_email_and_sentence_punctuation_unaffected():
    assert ats_service.find_contact("Mail: ece.kaya@example.com. Teşekkürler")["email"] == "ece.kaya@example.com"
    assert ats_service.find_contact("ali@ogr.ornek.edu.tr adresine")["email"] == "ali@ogr.ornek.edu.tr"
    assert ats_service.find_contact("E-posta yok. Sadece metin.")["email"] is None


def test_year_ranges_without_dash_from_ocr_are_counted():
    folded = ats_service.fold("Örnek A.Ş. 2022 Devam ediyor ... Deneme 2021 2022 ... Üniversite 2017 – 2021")
    assert len(ats_service._YEAR_RANGE_RE.findall(folded)) == 3


def test_single_years_are_not_ranges():
    assert ats_service._YEAR_RANGE_RE.findall(ats_service.fold("2021 yılında mezun oldum, 15 proje")) == []
