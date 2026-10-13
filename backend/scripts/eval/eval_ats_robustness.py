"""
Akademik ölçüm 3 — ATS uyumluluk skorunun duyarlılığı ve dayanıklılığı.

ATS skoru gerçek bir şirketin ATS'i değil, açıklanabilir bir kural kümesidir.
Bu betik kuralların amaçlandığı gibi davrandığını gösterir:

- Duyarlılık: aynı içerik kasıtlı bozulduğunda (standart dışı başlıklar;
  sayısal başarı ve tarih aralıkları çıkarılmış) skor ilgili kontrolde ve
  yalnızca orada düşmeli.
- Ayrıştırma riskleri: fotoğraf eklenince yalnızca "tablo, görsel ve özel karakter",
  beyaz yazıyla gizli anahtar kelime eklenince yalnızca "gizli metin" düşmeli.
- Dayanıklılık: CV taranmış (yalnızca görüntü) olarak yüklendiğinde metin OCR ile
  geri kazanılır. "Metin katmanı" kontrolü bilerek düşer (birçok gerçek ATS
  taranmış CV'yi okuyamaz); içerik kontrolleri ise mümkün olduğunca aynı kalmalı.
  OCR'ın metni ne kadar koruduğu karakter düzeyinde benzerlikle ölçülür.
- Determinizm: aynı dosya iki kez puanlandığında sonuç birebir aynı olmalı.

Kişisel veri kullanılmaz: CV'ler kurgusal profillerden betik içinde üretilir.

Çalıştırma (backend/ dizininden):
    python -m scripts.eval.eval_ats_robustness
Çıktı: docs/evaluation/ats_robustness.json ve ats_robustness.md
"""
import difflib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.services.ats_service import fold, score_cv  # noqa: E402
from app.services.cv_text_service import extract_cv_text  # noqa: E402

OUT_DIR = ROOT.parent / "docs" / "evaluation"

PROFILES = [
    {
        "name": "Deniz Yılmaz (kurgusal)", "email": "deniz.yilmaz@example.com", "phone": "+90 555 010 20 30",
        "title": "Backend Geliştirici",
        "experience": [
            ("Backend Geliştirici, Örnek Teknoloji A.Ş.", "2022 - Devam ediyor",
             "Python/FastAPI ile ödeme servisini geliştirdim; yanıt süresini %40 düşürdüm. 4 kişilik ekibe kod incelemesinde liderlik ettim."),
            ("Stajyer Yazılım Geliştirici, Deneme Yazılım", "2021 - 2022",
             "PostgreSQL sorgularını optimize ederek rapor üretimini 12 dakikadan 3 dakikaya indirdim."),
        ],
        "education": [("Bilgisayar Mühendisliği, Örnek Üniversitesi", "2017 - 2021")],
        "skills": "Python, FastAPI, Django, PostgreSQL, Redis, Docker, Git, REST API tasarımı",
    },
    {
        "name": "Ece Kaya (kurgusal)", "email": "ece.kaya@example.com", "phone": "+90 555 040 50 60",
        "title": "Frontend Geliştirici",
        "experience": [
            ("Frontend Geliştirici, Deneme Dijital", "2023 - Devam ediyor",
             "React ve TypeScript ile müşteri panelini yeniden yazdım; sayfa yüklenme süresini %35 azalttım, 3 yeni modülü teslim ettim."),
            ("Junior Web Geliştirici, Örnek Ajans", "2021 - 2023",
             "20'den fazla kurumsal web sitesinin erişilebilirlik iyileştirmelerini yaptım."),
        ],
        "education": [("Yazılım Mühendisliği, Deneme Üniversitesi", "2017 - 2021")],
        "skills": "React, TypeScript, Next.js, Redux, CSS, Jest, Figma",
    },
]

CONTENT_CHECKS = ("contact", "sections", "length", "dates", "quantified", "acronyms")

HEADINGS = {"standard": ("Deneyim", "Eğitim", "Beceriler"), "nonstandard": ("Neler Yaptım", "Okul Hayatım", "Yeteneklerim")}


def cv_html(p: Dict[str, Any], headings=HEADINGS["standard"], quantified: bool = True, dates: bool = True) -> str:
    def clean(text: str) -> str:
        if quantified:
            return text
        # Sayıları ve yüzdeleri çıkararak "ölçülebilir başarı" sinyalini kaldır.
        import re
        return re.sub(r"\s*%?\d+[\d.,]*\s*(%|kişilik|dakikadan|dakikaya|yeni|'den fazla)?", "", text)

    exp = "".join(
        f"<p><b>{title}</b>{' — ' + period if dates else ''}<br/>{clean(desc)}</p>" for title, period, desc in p["experience"]
    )
    edu = "".join(f"<p>{school}{' — ' + period if dates else ''}</p>" for school, period in p["education"])
    return (
        f"<h2>{p['name']}</h2><p>{p['title']}<br/>{p['email']} · {p['phone']}</p>"
        f"<h3>{headings[0]}</h3>{exp}<h3>{headings[1]}</h3>{edu}<h3>{headings[2]}</h3><p>{p['skills']}</p>"
    )


def text_pdf(html: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_htmlbox(fitz.Rect(50, 50, 545, 800), html, css="body{font-family:sans-serif;font-size:11pt;}")
    return doc.tobytes()


def scanned_pdf(pdf: bytes, dpi: int = 150) -> bytes:
    """Metin katmanını yok eder: her sayfa görüntüye çevrilip yalnızca görüntü içeren PDF'e konur."""
    src = fitz.open(stream=pdf, filetype="pdf")
    out = fitz.open()
    for page in src:
        pix = page.get_pixmap(dpi=dpi)
        new = out.new_page(width=page.rect.width, height=page.rect.height)
        new.insert_image(new.rect, stream=pix.tobytes("png"))
    return out.tobytes()


def with_photo(pdf: bytes) -> bytes:
    """Sağ üst köşeye vesikalık boyutunda bir fotoğraf ekler (Türkiye'de yaygın)."""
    doc = fitz.open(stream=pdf, filetype="pdf")
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 90, 120), 0)
    pix.set_rect(pix.irect, (180, 160, 150))
    doc[0].insert_image(fitz.Rect(455, 40, 545, 160), stream=pix.tobytes("png"))
    return doc.tobytes()


def with_hidden_keywords(pdf: bytes) -> bytes:
    """Sayfa altına beyaz yazıyla anahtar kelime doldurur (ATS'yi kandırma girişimi)."""
    doc = fitz.open(stream=pdf, filetype="pdf")
    doc[0].insert_text((50, 830), "Kubernetes Terraform Kafka Spark Airflow Snowflake", fontsize=9, color=(1, 1, 1))
    return doc.tobytes()


def evaluate(data: bytes) -> Dict[str, Any]:
    text, method, _, stats = extract_cv_text(data)
    result = score_cv(text, stats, method)
    return {"text": text, "method": method, "score": result["ats_score"],
            "checks": {c["id"]: c["earned"] for c in result["breakdown"]}}


def similarity(a: str, b: str) -> float:
    return round(difflib.SequenceMatcher(None, " ".join(fold(a).split()), " ".join(fold(b).split())).ratio(), 3)


def main() -> None:
    rows: List[Dict[str, Any]] = []
    for i, p in enumerate(PROFILES, start=1):
        base_pdf = text_pdf(cv_html(p))
        base = evaluate(base_pdf)
        again = evaluate(base_pdf)
        variants = {
            "taranmis": evaluate(scanned_pdf(base_pdf)),
            "standart_disi_baslik": evaluate(text_pdf(cv_html(p, headings=HEADINGS["nonstandard"]))),
            "sayisiz_tarihsiz": evaluate(text_pdf(cv_html(p, quantified=False, dates=False))),
            "fotografli": evaluate(with_photo(base_pdf)),
            "gizli_metin": evaluate(with_hidden_keywords(base_pdf)),
        }
        row = {
            "profile": f"CV{i}", "base_score": base["score"], "base_method": base["method"],
            "deterministic": base["score"] == again["score"] and base["checks"] == again["checks"],
            "variants": {},
        }
        for name, v in variants.items():
            changed = {k: v["checks"][k] - base["checks"][k] for k in base["checks"] if v["checks"][k] != base["checks"][k]}
            entry = {"score": v["score"], "delta": v["score"] - base["score"], "method": v["method"], "changed_checks": changed}
            if name == "taranmis":
                entry["text_similarity"] = similarity(base["text"], v["text"])
                # Yalnızca CV içeriğine bağlı kontroller; dosya biçimine bağlı olanlar (metin katmanı,
                # dosya boyutu: taranmış PDF genelde 2,5 MB'ı aşar) taranmış sürümde haklı olarak değişir.
                content = [k for k in CONTENT_CHECKS if k in base["checks"]]
                entry["content_checks_preserved"] = sum(v["checks"][k] == base["checks"][k] for k in content) / len(content)
            row["variants"][name] = entry
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "ats_robustness.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "ats_robustness.md").write_text(render_markdown(rows), encoding="utf-8")
    print(render_markdown(rows))


def render_markdown(rows: List[Dict[str, Any]]) -> str:
    names = {"taranmis": "Taranmış (OCR)", "standart_disi_baslik": "Standart dışı başlıklar", "sayisiz_tarihsiz": "Sayısız ve tarihsiz",
             "fotografli": "Fotoğraflı", "gizli_metin": "Beyaz yazıyla gizli anahtar kelime"}
    lines = ["# ATS skorunun duyarlılığı ve dayanıklılığı", "",
             "Kurgusal profillerden üretilen CV'ler; her varyant yalnızca bir özelliği değiştirir.", "",
             "| CV | Varyant | Skor | Fark | Değişen kontroller | OCR metin benzerliği | İçerik kontrolleri korunan |",
             "|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['profile']} | Özgün (metin PDF) | {r['base_score']} | — | — | — | — |")
        for key, v in r["variants"].items():
            changed = ", ".join(f"{k} {d:+d}" for k, d in v["changed_checks"].items()) or "yok"
            sim = v.get("text_similarity")
            kept = v.get("content_checks_preserved")
            lines.append(f"| {r['profile']} | {names[key]} | {v['score']} | {v['delta']:+d} | {changed} | "
                         f"{'—' if sim is None else sim} | {'—' if kept is None else f'{kept:.0%}'} |")
    det = all(r["deterministic"] for r in rows)
    lines += ["", f"Determinizm: aynı dosya iki kez puanlandı — {'tüm CV’lerde birebir aynı sonuç' if det else 'FARK VAR'}.",
              "", "Not: Taranmış varyantta 'text_layer' kontrolünün düşmesi tasarım gereğidir (birçok ATS görüntü CV'yi okuyamaz); "
              "taranmış PDF 2,5 MB'ı aştığında 'file_size' da düşer (Greenhouse bu boyutu ayrıştırmaz). "
              "'İçerik kontrolleri korunan' yalnızca içeriğe bağlı kontrolleri sayar: " + ", ".join(CONTENT_CHECKS) + "."]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
