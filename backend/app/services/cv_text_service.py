"""
CV dosyasından metin çıkarma. Sıra: (1) PDF metin katmanı (PyMuPDF), (2) metin
yoksa ya da dosya görselse OCR (EasyOCR, Türkçe+İngilizce), (3) DOCX.

Güvenlik: dosya türü istemcinin bildirdiği Content-Type'a değil, dosyanın ilk
baytlarına (magic bytes) bakılarak belirlenir. Çıkarılan metin ham VERİDİR —
LLM'e verilirken talimat olarak yorumlanmamalıdır (bkz. ileride cv_service).

Tüm fonksiyonlar senkron ve CPU-bound'dur; çağıran taraf `asyncio.to_thread`
ile çağırmalıdır.
"""
import io
import logging
import re
import threading
import zipfile
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

MAX_CV_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 30_000
MAX_OCR_PAGES = 4
# PDF'in metin katmanı bu kadar karakterden azsa taranmış sayılır ve OCR'a düşülür.
MIN_TEXT_LAYER_CHARS = 200

_ocr_reader = None
_ocr_lock = threading.Lock()


class UnsupportedCVFile(ValueError):
    pass


def detect_kind(data: bytes) -> Tuple[str, str]:
    """(kind, mime) döner; kind: 'pdf' | 'image' | 'docx'. Desteklenmeyen dosyada UnsupportedCVFile."""
    if data[:5] == b"%PDF-":
        return "pdf", "application/pdf"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image", "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image", "image/jpeg"
    if data[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if "word/document.xml" in z.namelist():
                    return "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        except zipfile.BadZipFile:
            pass
    raise UnsupportedCVFile("Desteklenmeyen dosya türü. PDF, DOCX, PNG veya JPEG yükleyin.")


def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        with _ocr_lock:
            if _ocr_reader is None:
                import os
                import easyocr
                logger.info("EasyOCR (tr, en) yükleniyor...")
                # Model dosyalarının (~100 MB) varsayılan olarak kullanıcı profiline
                # inmemesi için dizin ortam değişkeniyle değiştirilebilir.
                _ocr_reader = easyocr.Reader(
                    ["tr", "en"], gpu=False, verbose=False,
                    model_storage_directory=os.getenv("EASYOCR_MODEL_DIR") or None,
                )
    return _ocr_reader


def _ocr_image_bytes(image_bytes: bytes) -> str:
    # detail=0 -> yalnızca metin; paragraph=True satırları birleştirir.
    lines = _get_ocr_reader().readtext(image_bytes, detail=0, paragraph=True)
    return "\n".join(lines)


def _clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:MAX_TEXT_CHARS]


def _estimate_columns(page) -> int:
    """Sayfadaki metin bloklarının x konumlarına göre kaba sütun tahmini (1 ya da 2+).
    ATS ayrıştırıcıları çok sütunlu düzeni sıklıkla karıştırdığı için skorda kullanılır."""
    width = page.rect.width
    blocks = [b for b in page.get_text("blocks") if b[4].strip()]
    if len(blocks) < 6:
        return 1
    left = sum(1 for b in blocks if b[2] < width * 0.55)
    right = sum(1 for b in blocks if b[0] > width * 0.45)
    both_sides = left >= 3 and right >= 3 and not any(b[0] < width * 0.3 and b[2] > width * 0.7 for b in blocks[:3])
    return 2 if both_sides else 1


def _extract_pdf(data: bytes) -> Tuple[str, str, Dict[str, Any]]:
    import pymupdf as fitz

    with fitz.open(stream=data, filetype="pdf") as doc:
        page_count = doc.page_count
        text = "\n".join(page.get_text("text") for page in doc)
        columns = max((_estimate_columns(p) for p in doc), default=1)
        stats: Dict[str, Any] = {"page_count": page_count, "columns": columns, "has_text_layer": len(text.strip()) >= MIN_TEXT_LAYER_CHARS}

        if stats["has_text_layer"]:
            return _clean(text), "pdf_text", stats

        # Taranmış PDF: sayfaları görüntüye çevirip OCR.
        parts = []
        for page in list(doc)[:MAX_OCR_PAGES]:
            pix = page.get_pixmap(dpi=200)
            parts.append(_ocr_image_bytes(pix.tobytes("png")))
        return _clean("\n".join(parts)), "ocr", stats


def _extract_docx(data: bytes) -> Tuple[str, str, Dict[str, Any]]:
    import docx

    document = docx.Document(io.BytesIO(data))
    paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            paragraphs.append(" | ".join(c.text.strip() for c in row.cells if c.text.strip()))
    text = "\n".join(paragraphs)
    stats = {"page_count": None, "columns": 1, "has_text_layer": True, "table_count": len(document.tables)}
    return _clean(text), "docx", stats


def extract_cv_text(data: bytes) -> Tuple[str, str, str, Dict[str, Any]]:
    """
    (metin, yöntem, mime, istatistikler) döner. Dosya boyutu/türü geçersizse
    UnsupportedCVFile fırlatır. Metin boşsa (ör. OCR hiçbir şey okuyamadı)
    çağıran taraf bunu 'failed' olarak işaretlemelidir.
    """
    if len(data) > MAX_CV_BYTES:
        raise UnsupportedCVFile(f"Dosya çok büyük (en fazla {MAX_CV_BYTES // (1024 * 1024)} MB).")
    kind, mime = detect_kind(data)

    if kind == "pdf":
        text, method, stats = _extract_pdf(data)
    elif kind == "docx":
        text, method, stats = _extract_docx(data)
    else:
        text = _clean(_ocr_image_bytes(data))
        method, stats = "ocr", {"page_count": 1, "columns": 1, "has_text_layer": False}

    stats["char_count"] = len(text)
    return text, method, mime, stats
