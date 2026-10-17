"""
Kurum raporunun PDF çıktısı — PyMuPDF Story ile (HTML akışı, otomatik sayfalama).

Gizlilik: rapor yalnızca TOPLU veri içerir; öğrenci adı ya da öğrenci bazında skor
yoktur. Toplu skorlar kurum panelindeki kuralla aynıdır: en az MIN_COHORT öğrenci
katkı vermediyse gizlenir; haftalık ortalama da o haftada en az MIN_COHORT öğrenci
yoksa gösterilmez. Kullanım/maliyet bölümü yalnızca kurum yöneticisine eklenir.
Kullanıcıdan gelen tüm metinler (kurum/grup/ödev/konu adları) kaçışlanır.
"""
import io
import re
from datetime import datetime
from html import escape
from typing import Any, Dict, List, Optional

import pymupdf

from app.services.org_usage_service import TR_TZ
from app.services.progress_service import METRIC_LABELS, METRICS

MARGIN = 40
# Bir bölüm (başlık + tablonun ilk satırları) için sayfada kalması gereken en az yer;
# daha azı kaldıysa bölüm yeni sayfada başlar (Story page-break-inside'ı desteklemiyor).
MIN_SECTION_SPACE = 110
SECTION_GAP = 4

CSS = """
* { font-family: sans-serif; color: #0b0b0b; }
h1 { font-size: 20px; margin: 0 0 2px 0; }
h2 { font-size: 13px; margin: 16px 0 6px 0; }
p, li, td, th { font-size: 10px; line-height: 1.4; }
.muted { color: #52514e; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; border-bottom: 1px solid #c3c2b7; padding: 3px 4px; color: #52514e; }
td { border-bottom: 1px solid #e1e0d9; padding: 3px 4px; }
.num { text-align: right; }
.note { font-size: 9px; color: #52514e; }
"""


def _n(v: Any, digits: int = 0) -> str:
    if v is None:
        return "—"
    return f"{v:,.{digits}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(TR_TZ).strftime("%d.%m.%Y")
    except ValueError:
        return "—"


def _table(header: List[str], rows: List[List[str]], numeric_from: int = 1) -> str:
    head = "".join(f"<th class='{'num' if i >= numeric_from else ''}'>{escape(h)}</th>" for i, h in enumerate(header))
    body = "".join(
        "<tr>" + "".join(f"<td class='{'num' if i >= numeric_from else ''}'>{c}</td>" for i, c in enumerate(r)) + "</tr>"
        for r in rows
    )
    return f"<table><tr>{head}</tr>{body}</table>"


def _overview_html(overview: Dict[str, Any]) -> str:
    counts = overview.get("member_counts") or {}
    quota = overview["org"].get("monthly_interview_quota")
    month = f"{overview['month_interviews']}/{quota} (aylık kota)" if quota else f"{overview['month_interviews']} (kota sınırsız)"
    html = "<h2>Katılım</h2>" + _table(["Gösterge", "Değer"], [
        ["Öğrenci", _n(counts.get("candidate", 0))],
        ["Eğitmen / yönetici", _n(counts.get("instructor", 0) + counts.get("org_admin", 0))],
        ["Son 30 günde aktif öğrenci", _n(overview["active_students_30d"])],
        ["Bu ay tamamlanan mülakat", escape(month)],
        ["Tamamlanan mülakat (toplam)", _n(overview["completed_count"])],
        ["Katkı veren öğrenci", _n(overview["contributors"])],
    ])

    if not overview["aggregates_available"]:
        return html + (
            f"<h2>Skor istatistikleri</h2><p class='muted'>Toplu skorlar, en az {overview['min_cohort']} farklı öğrenci "
            f"kurum adına mülakat yaptığında gösterilir (şu an {overview['contributors']}). Küçük gruplarda ortalama, "
            "tek tek öğrencilerin skorunu açığa çıkarabileceği için rapora eklenmez.</p>"
        )

    means = overview.get("metric_means") or {}
    html += "<h2>Kurum ortalamaları</h2>" + _table(
        ["Ölçüt", "Ortalama (0-100)"],
        [["Genel", _n(means.get("average"))]] + [[escape(METRIC_LABELS[m]), _n(means.get(m))] for m in METRICS],
    )
    rubric = overview["org"].get("rubric")
    if rubric:
        html += (f"<p class='note'>Genel ortalama kurum rubriğiyle hesaplanır: teknik %{rubric.get('technical')}, "
                 f"özgüven %{rubric.get('confidence')}, iletişim %{rubric.get('vocabulary')}.</p>")

    weekly = overview.get("weekly") or []
    if weekly:
        html += "<h2>Haftalık eğilim (son 8 hafta)</h2>" + _table(
            ["Hafta", "Tamamlanan", "Ortalama"],
            [[escape(w["week"]), _n(w["count"]), _n(w["average"]) if w["average"] is not None else "gizli (&lt;3 öğrenci)"]
             for w in weekly],
        )
    topics = overview.get("topics") or []
    if topics:
        html += "<h2>Konular</h2>" + _table(
            ["Konu", "Mülakat", "Ortalama", "Durum"],
            [[escape(t["topic"]), _n(t["count"]), _n(t["average"]), "Gelişmeli" if t["weak"] else "İyi"] for t in topics],
        )
    return html


def _assignments_html(assignments: List[Dict[str, Any]]) -> str:
    if not assignments:
        return "<h2>Ödevler</h2><p class='muted'>Bu kapsamda ödev yok.</p>"
    rows = []
    for a in assignments:
        total = a.get("total_candidates") or 0
        done = a.get("completed_count") or 0
        rate = f" (%{round(100 * done / total)})" if total else ""
        rows.append([
            escape(a.get("title") or ""), escape(f"{a.get('role') or ''} / {a.get('topic') or ''}"), _date(a.get("due_at")),
            f"{done}/{total}{rate}", _n(a.get("in_progress_count") or 0),
        ])
    return "<h2>Ödevler</h2>" + _table(["Ödev", "Rol / konu", "Son tarih", "Tamamlayan", "Devam eden"], rows, numeric_from=3)


def _usage_html(usage: Dict[str, Any]) -> str:
    cost = usage.get("estimated_cost_usd")
    unpriced = usage.get("unpriced_models") or []
    if cost is None:
        cost_text = "hesaplanmadı (model fiyatı tanımlı değil)"
    else:
        cost_text = f"${_n(cost, 2)}" + (" (eksik: bazı modellerin fiyatı tanımlı değil)" if unpriced else "")
    html = f"<h2>Yapay zekâ kullanımı ve maliyet — {escape(usage['month'])}</h2>" + _table(["Gösterge", "Değer"], [
        ["Başlatılan / tamamlanan mülakat", f"{_n(usage['interviews_started'])} / {_n(usage['interviews_completed'])}"],
        ["Model çağrısı (başarısız)", f"{_n(usage['calls'])} ({_n(usage['failed_calls'])})"],
        ["Başarı oranı", f"%{_n(usage['success_rate'], 1)}" if usage.get("success_rate") is not None else "—"],
        ["Token (girdi / çıktı)", f"{_n(usage['prompt_tokens'])} / {_n(usage['completion_tokens'])}"],
        ["Mülakat başına token", f"{_n(usage.get('tokens_per_interview'))} (kaydı olan {_n(usage.get('metered_interviews', 0))} mülakat)"],
        ["Tahmini maliyet", escape(cost_text)],
    ])
    if usage.get("by_purpose"):
        html += "<h2>Amaca göre</h2>" + _table(
            ["Amaç", "Çağrı", "Token"],
            [[escape(p["purpose"]), _n(p["calls"]), _n(p["total_tokens"])] for p in usage["by_purpose"]],
        )
    if usage.get("by_model"):
        html += "<h2>Modele göre</h2>" + _table(
            ["Model", "Çağrı", "Başarısız", "Ort. süre", "Token", "Tahmini maliyet"],
            [[escape(m["model"]), _n(m["calls"]), _n(m["failed"]),
              f"{_n(m['avg_latency_ms'] / 1000, 1)} sn" if m.get("avg_latency_ms") is not None else "—",
              _n(m["prompt_tokens"] + m["completion_tokens"]),
              f"${_n(m['estimated_cost_usd'], 2)}" if m.get("estimated_cost_usd") is not None else "tanımsız"]
             for m in usage["by_model"]],
        )
    html += ("<p class='note'>Yalnızca kurum adına başlatılan mülakatların yapay zekâ çağrıları sayılır; öğrencilerin "
             "bireysel mülakatları ve CV/ilan analizleri kuruma yazılmaz. Başarısız denemeler de sağlayıcıya istek "
             "olarak gittiği için sayılır. Maliyet, tanımlı model fiyatlarıyla yapılmış bir tahmindir.</p>")
    return html


def build_org_report_pdf(overview: Dict[str, Any], assignments: List[Dict[str, Any]],
                         usage: Optional[Dict[str, Any]] = None, group_name: Optional[str] = None,
                         now: Optional[datetime] = None) -> bytes:
    generated = (now or datetime.now(TR_TZ)).astimezone(TR_TZ).strftime("%d.%m.%Y %H:%M")
    scope = f"Grup: {escape(group_name)}" if group_name else "Tüm kurum"
    html = (
        "<h1>DeepInsight — Kurum Raporu</h1>"
        f"<p class='muted'>{escape(overview['org']['name'])} · {scope} · Oluşturulma: {generated}</p>"
        + _overview_html(overview)
        + _assignments_html(assignments)
        + (_usage_html(usage) if usage else "")
        + "<p class='note'>Bu rapor öğrenci adı ya da öğrenci bazında skor içermez. Yalnızca kurum bağlamında yapılan "
          "mülakatlar sayılır.</p>"
    )

    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    page_rect = pymupdf.paper_rect("a4")
    content = page_rect + (MARGIN, MARGIN, -MARGIN, -MARGIN)
    device = writer.begin_page(page_rect)
    y = content.y0
    # Her <h2> bir bölüm başlatır; bölümler sırayla yerleştirilir ki başlık tablosundan ayrılmasın.
    for section in re.split(r"(?=<h2>)", html):
        story = pymupdf.Story(section, user_css=CSS)
        while True:
            more, filled = story.place(pymupdf.Rect(content.x0, y, content.x1, content.y1))
            if more and y > content.y0 and content.y1 - y < MIN_SECTION_SPACE:
                writer.end_page()
                device = writer.begin_page(page_rect)
                y = content.y0
                story = pymupdf.Story(section, user_css=CSS)
                continue
            story.draw(device)
            if not more:
                y = pymupdf.Rect(filled).y1 + SECTION_GAP  # place() dikdörtgeni demet olarak döner
                break
            writer.end_page()  # uzun tablo: kalan satırlar sonraki sayfada
            device = writer.begin_page(page_rect)
            y = content.y0
    writer.end_page()
    writer.close()

    # Sayfa numaraları (Story sayfa sayısını önceden bilmez).
    doc = pymupdf.open("pdf", buffer.getvalue())
    for i, page in enumerate(doc):
        page.insert_text((page_rect.width - MARGIN - 40, page_rect.height - 20), f"{i + 1} / {doc.page_count}",
                         fontsize=8, color=(0.32, 0.32, 0.31))
    return doc.tobytes()
