"""
Faz 4C — kurum raporlarının CSV dışa aktarımı.

Dışa aktarma ekrandaki gizlilik kurallarının aynısını uygular: skor sütunu
yalnızca öğrenci paylaşım rızası verdiyse doludur. Excel'in Türkçe karakterleri
doğru açması için UTF-8 BOM ve ';' ayırıcı kullanılır (Türkçe Excel yerel ayarı).
CSV formül enjeksiyonuna karşı '=', '+', '-', '@' ile başlayan hücreler kaçışlanır.
"""
import csv
import io
from typing import Any, Dict, Iterable, List, Optional

ROLE_LABEL = {"org_admin": "Kurum yöneticisi", "instructor": "Eğitmen", "candidate": "Öğrenci"}
STATUS_LABEL = {"completed": "Tamamlandı", "in_progress": "Devam ediyor", "not_started": "Başlamadı"}


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.1f}".replace(".", ",")
    text = str(value)
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        text = "'" + text
    return text


def _date(iso: Optional[str]) -> str:
    return (iso or "")[:10]


def to_csv(header: List[str], rows: Iterable[List[Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([_cell(v) for v in row])
    return "﻿" + buffer.getvalue()


def members_csv(rows: List[Dict[str, Any]], group_names: Dict[str, str]) -> str:
    return to_csv(
        ["Ad", "E-posta", "Rol", "Grup", "Mülakat sayısı", "Son mülakat", "Ortalama", "İlerleme paylaşımı"],
        (
            [r.get("name"), r.get("email"), ROLE_LABEL.get(r["role"], r["role"]),
             group_names.get(str(r.get("group_id") or ""), ""), r.get("interview_count", 0),
             _date(r.get("last_interview_at")),
             r.get("average") if r.get("share_progress") else None,
             "Evet" if r.get("share_progress") else "Hayır"]
            for r in rows
        ),
    )


def assignment_csv(rows: List[Dict[str, Any]]) -> str:
    return to_csv(
        ["Ad", "E-posta", "Durum", "Tamamlanma tarihi", "Skor", "İlerleme paylaşımı"],
        (
            [r.get("name"), r.get("email"), STATUS_LABEL.get(r["status"], r["status"]),
             _date(r.get("completed_at")), r.get("score") if r.get("share_progress") else None,
             "Evet" if r.get("share_progress") else "Hayır"]
            for r in rows
        ),
    )
