"""
Gelişim raporunun PDF çıktısı — PyMuPDF ile, ek bağımlılık olmadan.
Metinler HTML kutularıyla (dahili Noto yazı tipi Türkçe karakterleri destekler),
eğilim grafiği doğrudan vektör çizimle üretilir. Kullanıcıdan gelen tüm metinler
(rol, konu, ad) HTML'e girmeden önce kaçışlanır.
"""
from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List

import pymupdf

from app.services.progress_service import METRIC_LABELS, METRICS

PAGE_W, PAGE_H = 595, 842  # A4
MARGIN = 40

# Doğrulanmış kategorik palet (mavi, turuncu, aqua — tüm ikili kombinasyonlarda CVD güvenli).
SERIES_COLORS = {"technical": "#2a78d6", "confidence": "#eb6834", "vocabulary": "#1baf7a"}
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e1e0d9"

CSS = """
* { font-family: sans-serif; color: #0b0b0b; }
h1 { font-size: 20px; margin: 0 0 2px 0; }
h2 { font-size: 13px; margin: 14px 0 6px 0; }
p, li, td, th { font-size: 10px; line-height: 1.4; }
.muted { color: #52514e; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; border-bottom: 1px solid #c3c2b7; padding: 3px 4px; color: #52514e; }
td { border-bottom: 1px solid #e1e0d9; padding: 3px 4px; }
.kpi { font-size: 11px; }
"""


def _rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _fmt(v: Any, suffix: str = "") -> str:
    return "—" if v is None else f"{v:.0f}{suffix}"


def _delta(v: Any) -> str:
    if v is None:
        return ""
    return f" ({'+' if v > 0 else ''}{v:.0f})"


def _draw_trend_chart(page: pymupdf.Page, rect: pymupdf.Rect, timeline: List[Dict[str, Any]]) -> None:
    points = timeline[-15:]
    plot = pymupdf.Rect(rect.x0 + 28, rect.y0 + 8, rect.x1 - 8, rect.y1 - 22)

    for value in (0, 25, 50, 75, 100):
        y = plot.y1 - plot.height * value / 100
        page.draw_line((plot.x0, y), (plot.x1, y), color=_rgb(GRID), width=0.5)
        page.insert_text((rect.x0 + 4, y + 3), str(value), fontsize=7, color=_rgb(MUTED))

    n = len(points)
    xs = [plot.x0 + (plot.width * i / (n - 1) if n > 1 else plot.width / 2) for i in range(n)]
    for metric in METRICS:
        coords = [(xs[i], plot.y1 - plot.height * p[metric] / 100) for i, p in enumerate(points) if p[metric] is not None]
        color = _rgb(SERIES_COLORS[metric])
        if len(coords) > 1:
            page.draw_polyline(coords, color=color, width=1.6)
        for c in coords:
            page.draw_circle(c, 2.2, color=(1, 1, 1), fill=color, width=0.8)

    # x ekseni: ilk ve son tarih
    if points:
        first, last = (points[0].get("date") or "")[:10], (points[-1].get("date") or "")[:10]
        page.insert_text((plot.x0, plot.y1 + 11), first, fontsize=7, color=_rgb(MUTED))
        if n > 1:
            page.insert_text((plot.x1 - 40, plot.y1 + 11), last, fontsize=7, color=_rgb(MUTED))

    # lejant (renk tek başına kimlik taşımasın diye adlarla). Etiketler HTML kutusuyla
    # yazılır: insert_text'in temel yazı tipi İ/ş gibi Türkçe harfleri basamıyor.
    x = plot.x0
    for metric in METRICS:
        page.draw_line((x, rect.y1 - 4), (x + 12, rect.y1 - 4), color=_rgb(SERIES_COLORS[metric]), width=2)
        page.insert_htmlbox(
            pymupdf.Rect(x + 16, rect.y1 - 10, x + 140, rect.y1 + 4),
            f"<span style='font-size:8px'>{escape(METRIC_LABELS[metric])}</span>",
            css="* { font-family: sans-serif; color: #0b0b0b; }",
        )
        x += 140


def build_progress_pdf(progress: Dict[str, Any], display_name: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=PAGE_W, height=PAGE_H)
    generated = datetime.now(timezone.utc).strftime("%d.%m.%Y")
    trend = progress.get("trend") or {}
    means = progress.get("metric_means") or {}

    header = f"""
    <h1>DeepInsight — Gelişim Raporu</h1>
    <p class="muted">{escape(display_name)} · {generated} · {progress['completed_count']} tamamlanmış mülakat</p>
    """
    if progress["completed_count"] == 0:
        page.insert_htmlbox(pymupdf.Rect(MARGIN, MARGIN, PAGE_W - MARGIN, 200),
                            header + "<p>Henüz tamamlanmış mülakat yok. Rapor, ilk mülakatınızdan sonra oluşacak.</p>", css=CSS)
        return doc.tobytes()

    avg = trend.get("average") or {}
    kpis = (
        f"<p class='kpi'><b>Son 5 mülakat ortalaması:</b> {_fmt(avg.get('recent'))}/100{_delta(avg.get('delta'))}"
        f" &nbsp;·&nbsp; <b>En güçlü:</b> {escape(METRIC_LABELS.get(progress.get('strongest'), '—'))}"
        f" &nbsp;·&nbsp; <b>En zayıf:</b> {escape(METRIC_LABELS.get(progress.get('weakest'), '—'))}</p>"
        "<p class='kpi'>" + " &nbsp;·&nbsp; ".join(
            f"{METRIC_LABELS[m]}: {_fmt(means.get(m))}" for m in METRICS
        ) + " <span class='muted'>(son 10 mülakat ortalaması)</span></p>"
    )
    page.insert_htmlbox(pymupdf.Rect(MARGIN, MARGIN, PAGE_W - MARGIN, 150), header + kpis, css=CSS)

    page.insert_htmlbox(pymupdf.Rect(MARGIN, 150, PAGE_W - MARGIN, 170), "<h2>Skor eğilimi (son 15 mülakat)</h2>", css=CSS)
    _draw_trend_chart(page, pymupdf.Rect(MARGIN, 172, PAGE_W - MARGIN, 372), progress["timeline"])

    recs = progress.get("recommendations") or []
    rec_html = "<h2>Öneriler</h2>" + (
        "<ul>" + "".join(f"<li><b>{escape(r['title'])}</b> — {escape(r['detail'])}</li>" for r in recs) + "</ul>"
        if recs else "<p class='muted'>Şu an için öne çıkan bir gelişim alanı yok. Böyle devam!</p>"
    )
    video = progress.get("video")
    if video:
        rec_html += (
            "<h2>Video/ses analizi</h2>"
            f"<p>{video['count']} mülakat analiz edildi · Göz teması: {_fmt(video['eye_contact_pct'], '%')}"
            f" · Dolgu kelime/mülakat: {_fmt(video['filler_word_count'])}"
            f" · Konuşma hızı: {_fmt(video['speech_rate_wpm'])} kelime/dk</p>"
        )
    page.insert_htmlbox(pymupdf.Rect(MARGIN, 385, PAGE_W - MARGIN, PAGE_H - MARGIN), rec_html, css=CSS, scale_low=0.7)

    # Sayfa 2: konular ve mülakat geçmişi
    page2 = doc.new_page(width=PAGE_W, height=PAGE_H)
    topic_rows = "".join(
        f"<tr><td>{escape(t['topic'])}</td><td>{t['count']}</td><td>{_fmt(t['average'])}</td>"
        f"<td>{'Gelişmeli' if t['weak'] else 'İyi'}</td></tr>"
        for t in (progress.get("topics") or [])[:12]
    )
    history_rows = "".join(
        f"<tr><td>{escape((p.get('date') or '')[:10])}</td><td>{escape(p.get('role') or '')}</td>"
        f"<td>{escape(p.get('topic') or '')}</td><td>{escape(p.get('difficulty') or '—')}</td>"
        f"<td>{_fmt(p['technical'])}</td><td>{_fmt(p['confidence'])}</td><td>{_fmt(p['vocabulary'])}</td>"
        f"<td><b>{_fmt(p['average'])}</b></td></tr>"
        for p in reversed(progress["timeline"][-20:])
    )
    tables = (
        "<h2>Konu bazında performans</h2>"
        "<table><tr><th>Konu</th><th>Mülakat</th><th>Ortalama</th><th>Durum</th></tr>" + topic_rows + "</table>"
        "<h2>Son mülakatlar</h2>"
        "<table><tr><th>Tarih</th><th>Rol</th><th>Konu</th><th>Seviye</th><th>Teknik</th><th>Özgüven</th>"
        "<th>İletişim</th><th>Ort.</th></tr>" + history_rows + "</table>"
        "<p class='muted'>Özgüven: video analizi varsa göz teması/ses sinyallerinden, yoksa yazılı cevaplardan tahmin edilir.</p>"
    )
    page2.insert_htmlbox(pymupdf.Rect(MARGIN, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN), tables, css=CSS, scale_low=0.6)
    return doc.tobytes()
