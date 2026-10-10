"""
ATS uyumluluk skoru — kural tabanlı ve AÇIKLANABİLİR.

Bu bir TAHMİNdir: her şirketin ATS'i (başvuru takip sistemi) farklı çalışır ve
hiçbir skor "şu ATS'den kesin geçer" garantisi vermez. Burada ölçülen, genel
ATS ayrıştırıcılarının yaygın zayıflıklarıdır: metin katmanı, çok sütunlu
düzen, standart bölüm başlıkları, iletişim bilgisi, tarih biçimi, uzunluk,
ölçülebilir başarı ifadeleri ve özel karakter/tablo kullanımı.

Her kontrol (puan, gerekçe, düzeltme önerisi) ayrı döner; toplam 100 puandır.
LLM kullanılmaz: aynı CV her zaman aynı skoru alır (tekrarlanabilir, test edilebilir).
"""
import re
from typing import Any, Dict, List

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\s().-]{8,}\d)(?!\d)")
_PRIVATE_USE_RE = re.compile(r"[-]")

_FOLD = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u"})

SECTION_KEYWORDS = {
    "experience": ["deneyim", "tecrube", "experience", "work history", "employment", "calisma gecmisi"],
    "education": ["egitim", "education", "akademik"],
    "skills": ["beceri", "yetenek", "yetkinlik", "skills", "teknolojiler"],
    "projects": ["proje", "projects"],
    "summary": ["ozet", "profil", "hakkimda", "summary", "profile", "about"],
    "certifications": ["sertifika", "certification", "kurs", "courses"],
}
REQUIRED_SECTIONS = ("experience", "education", "skills")

_YEAR_RANGE_RE = re.compile(
    r"(19|20)\d{2}\s*[-–—/]\s*((19|20)\d{2}|devam|present|halen|gunumuz|bugun|now|current)"
)
_QUANT_RE = re.compile(r"\d+\s?%|%\s?\d+|\d+\s?(?:x|k|m|bin|milyon|kullanici|users?|ms|sn|saat|gun|ay|kisi)\b")


def fold(text: str) -> str:
    """Türkçe karakterleri sadeleştirip küçük harfe çevirir (başlık/anahtar kelime eşleşmesi için)."""
    return text.replace("İ", "i").replace("I", "ı").lower().translate(_FOLD)


def find_contact(text: str) -> Dict[str, Any]:
    email = _EMAIL_RE.search(text)
    phone = next((m.group(1) for m in _PHONE_RE.finditer(text) if sum(c.isdigit() for c in m.group(1)) >= 10), None)
    return {"email": email.group(0) if email else None, "phone": phone}


def mask_contact(text: str) -> str:
    """E-posta ve telefonu LLM'e göndermeden önce maskeler (veri minimizasyonu)."""
    text = _EMAIL_RE.sub("[E-POSTA]", text)
    return _PHONE_RE.sub(lambda m: "[TELEFON]" if sum(c.isdigit() for c in m.group(1)) >= 10 else m.group(0), text)


def detect_sections(text: str) -> List[str]:
    found = set()
    for line in text.splitlines():
        line = line.strip(" :•-–—*#\t")
        if not line or len(line) > 40 or len(line.split()) > 4:
            continue
        folded = fold(line)
        for section, keywords in SECTION_KEYWORDS.items():
            if any(k in folded for k in keywords):
                found.add(section)
    return sorted(found)


def _check(check_id: str, label: str, weight: int, earned: int, detail: str, tip: str) -> Dict[str, Any]:
    status = "pass" if earned >= weight else ("fail" if earned <= 0 else "partial")
    return {
        "id": check_id, "label": label, "weight": weight, "earned": earned, "status": status,
        "detail": detail, "tip": None if status == "pass" else tip,
    }


def score_cv(text: str, stats: Dict[str, Any], method: str) -> Dict[str, Any]:
    folded = fold(text)
    checks: List[Dict[str, Any]] = []

    # 1) Metin katmanı (20)
    if method in ("pdf_text", "docx"):
        checks.append(_check("text_layer", "Makine tarafından okunabilir metin", 20, 20,
                             "Dosyada seçilebilir metin var.", ""))
    else:
        checks.append(_check("text_layer", "Makine tarafından okunabilir metin", 20, 6,
                             "CV görüntü/taranmış; metin yalnızca OCR ile okunabildi. Birçok ATS bu dosyayı okuyamaz.",
                             "CV'yi Word veya PDF olarak metin korunacak şekilde (tarama değil) dışa aktarıp yükleyin."))

    # 2) Tek sütun (10)
    columns = stats.get("columns") or 1
    checks.append(_check("single_column", "Tek sütunlu düzen", 10, 10 if columns <= 1 else 3,
                         "Düzen tek sütun görünüyor." if columns <= 1 else "Çok sütunlu düzen algılandı; ATS metni karışık sırada okuyabilir.",
                         "İki sütunlu şablon yerine tek sütunlu, düz bir düzen kullanın."))

    # 3) İletişim bilgisi (10)
    contact = find_contact(text)
    earned = (5 if contact["email"] else 0) + (5 if contact["phone"] else 0)
    missing = [n for n, ok in (("e-posta", contact["email"]), ("telefon", contact["phone"])) if not ok]
    checks.append(_check("contact", "İletişim bilgisi", 10, earned,
                         "E-posta ve telefon bulundu." if not missing else f"Bulunamayan: {', '.join(missing)}.",
                         "CV'nin üst kısmına e-posta ve telefonu düz metin olarak ekleyin (başlık/üstbilgi alanına değil)."))

    # 4) Standart bölümler (20)
    sections = detect_sections(text)
    have = [s for s in REQUIRED_SECTIONS if s in sections]
    earned = round(20 * len(have) / len(REQUIRED_SECTIONS))
    names_tr = {"experience": "Deneyim", "education": "Eğitim", "skills": "Beceriler"}
    miss_tr = [names_tr[s] for s in REQUIRED_SECTIONS if s not in have]
    checks.append(_check("sections", "Standart bölüm başlıkları", 20, earned,
                         "Deneyim, Eğitim ve Beceriler başlıkları bulundu." if not miss_tr
                         else f"Tanınan başlık bulunamadı: {', '.join(miss_tr)}.",
                         "Bölümleri 'Deneyim', 'Eğitim', 'Beceriler' gibi standart başlıklarla adlandırın."))

    # 5) Uzunluk (10)
    pages = stats.get("page_count")
    chars = stats.get("char_count") or len(text)
    pages_ok = pages is None or pages <= 2
    chars_ok = 1200 <= chars <= 9000
    earned = 10 if (pages_ok and chars_ok) else (5 if (pages is None or pages <= 3) and chars >= 600 else 0)
    checks.append(_check("length", "Uygun uzunluk", 10, earned,
                         f"{pages or '?'} sayfa, yaklaşık {chars} karakter.",
                         "Deneyimli değilseniz 1, deneyimliyseniz en fazla 2 sayfada tutun; çok kısa CV'de içerik ekleyin."))

    # 6) Tarih biçimi (10)
    date_ranges = len(_YEAR_RANGE_RE.findall(folded))
    checks.append(_check("dates", "Tarih aralıkları", 10, 10 if date_ranges >= 2 else (5 if date_ranges == 1 else 0),
                         f"{date_ranges} tarih aralığı bulundu.",
                         "Deneyim ve eğitimi '2021 - 2023' veya '2022 - Devam ediyor' gibi net tarih aralıklarıyla yazın."))

    # 7) Ölçülebilir başarı (10)
    quant = len(_QUANT_RE.findall(folded))
    checks.append(_check("quantified", "Ölçülebilir başarılar", 10, 10 if quant >= 3 else (5 if quant >= 1 else 0),
                         f"{quant} ölçülebilir ifade (yüzde, sayı, süre vb.) bulundu.",
                         "Başarıları sayılarla ifade edin: 'yanıt süresini %40 düşürdüm', '5 kişilik ekibe liderlik ettim'."))

    # 8) Biçimlendirme riski (10)
    tables = stats.get("table_count") or 0
    icons = len(_PRIVATE_USE_RE.findall(text))
    if tables or icons > 5:
        reason = []
        if tables:
            reason.append(f"{tables} tablo")
        if icons > 5:
            reason.append("ikon/özel karakterler")
        checks.append(_check("formatting", "Tablo ve özel karakter", 10, 4,
                             f"Algılandı: {', '.join(reason)}. ATS'ler bunları bozabilir.",
                             "Tablo ve simge yazı tipleri yerine düz metin ve standart madde işaretleri kullanın."))
    else:
        checks.append(_check("formatting", "Tablo ve özel karakter", 10, 10, "Tablo veya özel karakter sorunu yok.", ""))

    total = sum(c["earned"] for c in checks)
    lost = sorted((c for c in checks if c["tip"]), key=lambda c: c["weight"] - c["earned"], reverse=True)
    return {
        "ats_score": total,
        "breakdown": checks,
        "suggestions": [c["tip"] for c in lost[:5]],
        "detected_sections": sections,
        "contact": contact,
    }
