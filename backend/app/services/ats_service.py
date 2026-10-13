"""
ATS uyumluluk skoru — kural tabanlı ve AÇIKLANABİLİR.

Bu bir TAHMİNdir: her şirketin ATS'i (başvuru takip sistemi) farklı çalışır ve
hiçbir skor "şu ATS'den kesin geçer" garantisi vermez. Burada ölçülen, genel
ATS ayrıştırıcılarının yaygın zayıflıklarıdır: metin katmanı, çok sütunlu
düzen, standart bölüm başlıkları, iletişim bilgisi, tarih biçimi, uzunluk,
ölçülebilir başarı ifadeleri, tablo/görsel/özel karakter kullanımı, dosya boyutu,
üst/alt bilgideki iletişim bilgisi, gizli metin ve açılımsız kısaltmalar.
Kontrollerin dayanağı ve kanıt düzeyleri: docs/research/MULAKAT_VE_ATS_ARASTIRMASI.md §4.

Her kontrol (puan, gerekçe, düzeltme önerisi) ayrı döner; toplam 100 puandır.
LLM kullanılmaz: aynı CV her zaman aynı skoru alır (tekrarlanabilir, test edilebilir).
"""
import re
from typing import Any, Dict, List

# OCR noktaların ve @'in çevresine boşluk ekleyebiliyor ("ad .soyad@ornek. com");
# bu yüzden ayraçların yanında tek bir boşluğa izin verilir. Aksi halde taranmış
# CV'de e-posta hem "bulunamadı" sayılır hem de LLM'e maskelenmeden gider.
# Alan adında boşluk toleransı yalnızca son uzantıda (com, tr, edu...) — cümle sonu
# noktasından sonraki kelime ("...com. Teşekkürler") e-postaya katılmasın diye.
_EMAIL_RE = re.compile(r"[\w+-]+(?:\s?\.\s?[\w+-]+)*\s?@\s?[\w-]+(?:\.[\w-]+)*\s?\.\s?[a-z]{2,6}\b")
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

# Ayraç (tire/eğik çizgi) yoksa yalnızca boşluk da kabul edilir: OCR tireleri
# sıklıkla düşürür ("2021 – 2023" -> "2021 2023").
_YEAR_RANGE_RE = re.compile(
    r"(19|20)\d{2}(?:\s*[-–—/]\s*|\s+)((19|20)\d{2}|devam|present|halen|gunumuz|bugun|now|current)"
)
_QUANT_RE = re.compile(r"\d+\s?%|%\s?\d+|\d+\s?(?:x|k|m|bin|milyon|kullanici|users?|ms|sn|saat|gun|ay|kisi)\b")

# Greenhouse 2,5 MB'tan büyük CV'yi ayrıştırmıyor (docs/research/MULAKAT_VE_ATS_ARASTIRMASI.md §4.2).
MAX_PARSEABLE_BYTES = int(2.5 * 1024 * 1024)
# Gizli metin eşiği: birkaç karakterlik bir süs (beyaz nokta, ayraç) cezalandırılmaz.
HIDDEN_TEXT_MIN_CHARS = 20

# İlanda açılımıyla, CV'de yalnızca kısaltmayla (ya da tersi) geçebilen terimler. ATS'lerin
# çoğu eş anlamlı tanımadığı için ikisini birlikte yazmak önerilir: "Amazon Web Services (AWS)".
# Açılımlar fold() edilmiş halde; Türkçe karşılığı da kabul edilir. SQL/HTML/API gibi açılımı
# hiç yazılmayan yerleşik kısaltmalar bilerek listede yok.
ACRONYMS: Dict[str, tuple] = {
    "AWS": ("amazon web services",),
    "GCP": ("google cloud",),
    "CI/CD": ("continuous integration", "continuous delivery", "continuous deployment", "surekli entegrasyon"),
    "ML": ("machine learning", "makine ogrenmesi"),
    "NLP": ("natural language processing", "dogal dil isleme"),
    "AI": ("artificial intelligence", "yapay zeka"),
    "OOP": ("object oriented", "object-oriented", "nesne yonelimli", "nesneye yonelik"),
    "TDD": ("test driven", "test-driven", "test gudumlu"),
    "QA": ("quality assurance", "kalite guvence"),
    "UX": ("user experience", "kullanici deneyimi"),
    "ERP": ("enterprise resource planning", "kurumsal kaynak planlama"),
    "CRM": ("customer relationship", "musteri iliskileri"),
    "SEO": ("search engine optimization", "arama motoru optimizasyonu"),
    "KPI": ("key performance indicator", "temel performans gostergesi"),
    "BI": ("business intelligence", "is zekasi"),
}


_HEADER_CONTACT_TIP = "E-posta ve telefonu üst bilgiden çıkarıp sayfanın ilk satırlarına düz metin olarak taşıyın."


def _fmt_size(size: int) -> str:
    return f"{size / (1024 * 1024):.1f} MB".replace(".", ",") if size >= 1024 * 1024 else f"{max(1, round(size / 1024))} KB"


def missing_acronym_expansions(text: str) -> List[str]:
    """CV'de geçen ama açılımı hiçbir yerde yazılmamış kısaltmalar (ACRONYMS sırasıyla)."""
    folded = fold(text)
    missing = []
    for acronym, expansions in ACRONYMS.items():
        if re.search(rf"(?<![\w/]){re.escape(acronym)}(?![\w/])", text) and not any(e in folded for e in expansions):
            missing.append(acronym)
    return missing


def fold(text: str) -> str:
    """Türkçe karakterleri sadeleştirip küçük harfe çevirir (başlık/anahtar kelime eşleşmesi için)."""
    return text.replace("İ", "i").replace("I", "ı").lower().translate(_FOLD)


def find_contact(text: str) -> Dict[str, Any]:
    email = _EMAIL_RE.search(text)
    phone = next((m.group(1) for m in _PHONE_RE.finditer(text) if sum(c.isdigit() for c in m.group(1)) >= 10), None)
    return {"email": re.sub(r"\s+", "", email.group(0)) if email else None, "phone": phone}


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

    # 1) Metin katmanı (15)
    if method in ("pdf_text", "docx"):
        checks.append(_check("text_layer", "Makine tarafından okunabilir metin", 15, 15,
                             "Dosyada seçilebilir metin var.", ""))
    else:
        checks.append(_check("text_layer", "Makine tarafından okunabilir metin", 15, 5,
                             "CV görüntü/taranmış; metin yalnızca OCR ile okunabildi. Birçok ATS bu dosyayı okuyamaz.",
                             "CV'yi Word veya PDF olarak metin korunacak şekilde (tarama değil) dışa aktarıp yükleyin."))

    # 2) Tek sütun (5)
    columns = stats.get("columns") or 1
    checks.append(_check("single_column", "Tek sütunlu düzen", 5, 5 if columns <= 1 else 1,
                         "Düzen tek sütun görünüyor." if columns <= 1 else "Çok sütunlu düzen algılandı; ATS metni karışık sırada okuyabilir.",
                         "İki sütunlu şablon yerine tek sütunlu, düz bir düzen kullanın."))

    # 3) İletişim bilgisi (15)
    contact = find_contact(text)
    earned = (8 if contact["email"] else 0) + (7 if contact["phone"] else 0)
    missing = [n for n, ok in (("e-posta", contact["email"]), ("telefon", contact["phone"])) if not ok]
    in_header = bool(stats.get("header_footer_contact"))
    checks.append(_check("contact", "İletişim bilgisi", 15, earned,
                         "E-posta ve telefon bulundu." if not missing
                         else f"Sayfa gövdesinde bulunamayan: {', '.join(missing)} (üst/alt bilgide var)." if in_header
                         else f"Bulunamayan: {', '.join(missing)}.",
                         _HEADER_CONTACT_TIP if in_header
                         else "CV'nin üst kısmına e-posta ve telefonu düz metin olarak ekleyin (başlık/üstbilgi alanına değil)."))

    # 4) Standart bölümler (25)
    sections = detect_sections(text)
    have = [s for s in REQUIRED_SECTIONS if s in sections]
    earned = round(25 * len(have) / len(REQUIRED_SECTIONS))
    names_tr = {"experience": "Deneyim", "education": "Eğitim", "skills": "Beceriler"}
    miss_tr = [names_tr[s] for s in REQUIRED_SECTIONS if s not in have]
    checks.append(_check("sections", "Standart bölüm başlıkları", 25, earned,
                         "Deneyim, Eğitim ve Beceriler başlıkları bulundu." if not miss_tr
                         else f"Tanınan başlık bulunamadı: {', '.join(miss_tr)}.",
                         "Bölümleri 'Deneyim', 'Eğitim', 'Beceriler' gibi standart başlıklarla adlandırın."))

    # 5) Uzunluk (5)
    pages = stats.get("page_count")
    chars = stats.get("char_count") or len(text)
    pages_ok = pages is None or pages <= 2
    chars_ok = 1200 <= chars <= 9000
    earned = 5 if (pages_ok and chars_ok) else (2 if (pages is None or pages <= 3) and chars >= 600 else 0)
    checks.append(_check("length", "Uygun uzunluk", 5, earned,
                         f"{pages} sayfa, yaklaşık {chars} karakter." if pages else f"Yaklaşık {chars} karakter.",
                         "Deneyimli değilseniz 1, deneyimliyseniz en fazla 2 sayfada tutun; çok kısa CV'de içerik ekleyin."))

    # 6) Tarih biçimi (5)
    date_ranges = len(_YEAR_RANGE_RE.findall(folded))
    checks.append(_check("dates", "Tarih aralıkları", 5, 5 if date_ranges >= 2 else (2 if date_ranges == 1 else 0),
                         f"{date_ranges} tarih aralığı bulundu.",
                         "Deneyim ve eğitimi '2021 - 2023' veya '2022 - Devam ediyor' gibi net tarih aralıklarıyla yazın."))

    # 7) Ölçülebilir başarı (5)
    quant = len(_QUANT_RE.findall(folded))
    checks.append(_check("quantified", "Ölçülebilir başarılar", 5, 5 if quant >= 3 else (2 if quant >= 1 else 0),
                         f"{quant} ölçülebilir ifade (yüzde, sayı, süre vb.) bulundu.",
                         "Başarıları sayılarla ifade edin: 'yanıt süresini %40 düşürdüm', '5 kişilik ekibe liderlik ettim'."))

    # Bu sürümden önce yüklenen CV'lerde görsel/gizli metin/üst bilgi istatistiği yok: puan kesilmez,
    # ama "sorun yok" da denmez (yeniden yükleyince ölçülür).
    legacy = "graphic_count" not in stats
    unknown = "Bilinmiyor: CV bu kontrolden önce yüklendi; yeniden yükleyin."

    # 8) Biçimlendirme riski (5): tablo, fotoğraf/grafik, simge yazı tipleri
    tables = stats.get("table_count") or 0
    graphics = stats.get("graphic_count") or 0
    icons = len(_PRIVATE_USE_RE.findall(text))
    if tables or graphics or icons > 5:
        reason = []
        if tables:
            reason.append(f"{tables} tablo")
        if graphics:
            reason.append(f"{graphics} fotoğraf/grafik")
        if icons > 5:
            reason.append("ikon/özel karakterler")
        checks.append(_check("formatting", "Tablo, görsel ve özel karakter", 5, 2,
                             f"Algılandı: {', '.join(reason)}. ATS'ler bunları bozabilir ya da yok sayar.",
                             "Tablo, fotoğraf, grafik ve simge yazı tipleri yerine düz metin ve standart madde işaretleri kullanın; "
                             "fotoğraf isteyen ilanlarda bile ATS'ye fotoğrafsız sürümü yükleyin."))
    else:
        checks.append(_check("formatting", "Tablo, görsel ve özel karakter", 5, 5,
                             "Tablo veya özel karakter sorunu yok; görseller bilinmiyor (eski yükleme)." if legacy
                             else "Tablo, görsel veya özel karakter sorunu yok.", ""))

    # 9) Dosya boyutu (5). Eski yüklemelerde boyut bilinmiyor: kontrol edilemedi, puan kesilmez.
    size = stats.get("file_size")
    if size is None or size <= MAX_PARSEABLE_BYTES:
        checks.append(_check("file_size", "Dosya boyutu", 5, 5,
                             f"{_fmt_size(size)}, sınırın altında." if size is not None else unknown, ""))
    else:
        checks.append(_check("file_size", "Dosya boyutu", 5, 0,
                             f"{_fmt_size(size)}. Bazı ATS'ler (ör. Greenhouse) 2,5 MB'tan büyük CV'yi ayrıştırmaz.",
                             "Görselleri kaldırıp ya da sıkıştırıp CV'yi 2,5 MB'ın altına indirin."))

    # 10) Üst/alt bilgideki iletişim (5): Workday gibi ATS'ler bu alanları okumaz.
    if stats.get("header_footer_contact") and not (contact["email"] or contact["phone"]):
        checks.append(_check("header_footer", "Üst/alt bilgide iletişim", 5, 0,
                             "İletişim bilgisi yalnızca sayfa üst/alt bilgisinde; bazı ATS'ler bu alanı hiç okumaz.",
                             _HEADER_CONTACT_TIP))
    elif stats.get("header_footer_contact"):
        checks.append(_check("header_footer", "Üst/alt bilgide iletişim", 5, 3,
                             "İletişim bilgisinin bir kısmı üst/alt bilgide; o kısım bazı ATS'lerde kaybolabilir.",
                             "İletişim bilgisinin tamamını sayfa gövdesine, düz metin olarak yazın."))
    else:
        checks.append(_check("header_footer", "Üst/alt bilgide iletişim", 5, 5,
                             unknown if legacy else "Üst/alt bilgide iletişim bilgisi yok.", ""))

    # 11) Gizli metin (5): beyaz/minik yazıyla anahtar kelime doldurmak tespit edilip başvuruyu işaretletebilir.
    hidden = stats.get("hidden_text_chars") or 0
    if hidden >= HIDDEN_TEXT_MIN_CHARS:
        checks.append(_check("hidden_text", "Gizli metin", 5, 0,
                             f"Yaklaşık {hidden} karakter beyaz, saydam ya da okunamayacak kadar küçük yazı var.",
                             "Görünmeyen anahtar kelimeleri kaldırın; modern ATS'ler bunu fark edip başvuruyu işaretleyebilir."))
    else:
        checks.append(_check("hidden_text", "Gizli metin", 5, 5, unknown if legacy else "Gizli ya da okunamayan yazı yok.", ""))

    # 12) Kısaltma + açılım (5)
    missing_expansions = missing_acronym_expansions(text)
    if missing_expansions:
        examples = ", ".join(f"{ACRONYMS[a][0].title()} ({a})" for a in missing_expansions[:3])
        checks.append(_check("acronyms", "Kısaltma ve açılımı", 5, 3 if len(missing_expansions) <= 2 else 1,
                             f"Açılımı yazılmamış kısaltma: {', '.join(missing_expansions)}.",
                             f"İlan açılımı kullanabilir; ikisini birlikte yazın: {examples}."))
    else:
        checks.append(_check("acronyms", "Kısaltma ve açılımı", 5, 5, "Kısaltmalar açılımlarıyla birlikte ya da hiç yok.", ""))

    total = sum(c["earned"] for c in checks)
    lost = sorted((c for c in checks if c["tip"]), key=lambda c: c["weight"] - c["earned"], reverse=True)
    return {
        "ats_score": total,
        "breakdown": checks,
        # Aynı düzeltmeyi öneren kontroller (iletişim + üst bilgi) öneri listesinde tekrarlanmaz.
        "suggestions": list(dict.fromkeys(c["tip"] for c in lost))[:5],
        "detected_sections": sections,
        "contact": contact,
    }
