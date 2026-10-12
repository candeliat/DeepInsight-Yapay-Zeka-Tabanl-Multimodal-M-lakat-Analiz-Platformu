"""
Faz 5 — pilot çalışma: araştırma onamı, anketler ve önce/sonra raporu.

Etik/KVKK kuralları:
- Pilot verisi yalnızca açık araştırma onamı (consent_type='research_pilot')
  veren katılımcılardan toplanır ve rapora yalnızca onlar girer.
- Onam geri çekilirse anket yanıtları silinir; kişi rapordan anında çıkar.
- Rapor kimliksizdir: katılımcılar onam sırasına göre P01, P02... takma adıyla
  görünür; e-posta/ad rapora ve CSV'ye hiç girmez.

Ölçümler (tamamen deterministik):
- Önce/sonra: katılımcının ilk ve son tamamlanmış mülakatının ortalama skoru
  (en az 2 mülakat). En az 4 mülakat varsa ilk 2 / son 2 ortalaması da verilir
  (tek bir kötü/iyi günün etkisini azaltır).
- Eşleştirilmiş t-testi + Wilcoxon işaretli sıra testi (küçük örneklemde normal
  dağılım varsayımı zayıf olduğundan ikisi birlikte raporlanır) ve etki
  büyüklüğü Cohen's dz = ort(fark) / ss(fark).
- SUS (System Usability Scale): standart 10 madde, 0-100 puan (68 ≈ ortalama).
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Bu modül senkron yazılmıştır: iş parçacığına özel senkron istemciyi kullanır ve asenkron
# koddan asyncio.to_thread ile çağrılır (bkz. app/core/database.py).
from app.core.database import sync_supabase as supabase
from app.services import progress_service

CONSENT_TYPE = "research_pilot"
CONSENT_VERSION = "2026-10-v1"
CONSENT_TEXT = (
    "DeepInsight'ın mülakat hazırlığına etkisini ölçen bir pilot çalışmaya katılmayı kabul ediyorsunuz. "
    "Katılırsanız tamamladığınız mülakatların skorları ve kısa anket yanıtlarınız kimliksizleştirilerek "
    "(ad ve e-posta olmadan, P01 gibi bir takma adla) araştırma raporunda kullanılır. Katılım gönüllüdür; "
    "onamınızı istediğiniz zaman geri çekebilirsiniz — bu durumda anket yanıtlarınız silinir ve verileriniz "
    "rapora dahil edilmez. Platformu kullanmaya devam etmeniz katılımınıza bağlı değildir."
)

SUS_ITEMS = [
    "Bu sistemi sık sık kullanmak isteyeceğimi düşünüyorum.",
    "Sistemi gereksiz yere karmaşık buldum.",
    "Sistemin kullanımının kolay olduğunu düşündüm.",
    "Bu sistemi kullanabilmek için teknik bir kişinin desteğine ihtiyaç duyacağımı düşünüyorum.",
    "Sistemdeki çeşitli işlevlerin iyi bütünleştirildiğini düşündüm.",
    "Sistemde çok fazla tutarsızlık olduğunu düşündüm.",
    "Çoğu insanın bu sistemi kullanmayı çok çabuk öğreneceğini düşünüyorum.",
    "Sistemi kullanmayı çok zahmetli buldum.",
    "Sistemi kullanırken kendimden çok emin hissettim.",
    "Bu sistemi kullanmaya başlamadan önce pek çok şey öğrenmem gerekti.",
]

POST_ITEMS = {
    "useful": "Bu mülakat hazırlığım için faydalıydı.",
    "realistic": "Sorular gerçek bir mülakata benziyordu.",
    "feedback_clear": "Geri bildirim anlaşılır ve uygulanabilirdi.",
}


def _db():
    if not supabase:
        raise RuntimeError("Supabase client is not initialized")
    return supabase


# --- saf hesaplar (test edilebilir) ---

def sus_score(answers: List[int]) -> float:
    """Standart SUS: tek maddeler (yanıt-1), çift maddeler (5-yanıt); toplam x 2.5 -> 0-100."""
    if len(answers) != 10 or any(a not in (1, 2, 3, 4, 5) for a in answers):
        raise ValueError("SUS 10 maddeden oluşur ve her yanıt 1-5 arasında olmalıdır.")
    total = sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))
    return total * 2.5


def sus_grade(score: Optional[float]) -> Optional[str]:
    """Sauro-Lewis eğrisine göre kaba yorum (68 ≈ ortalama)."""
    if score is None:
        return None
    if score >= 80.3:
        return "Mükemmel"
    if score >= 68:
        return "İyi (ortalamanın üstü)"
    if score >= 51:
        return "Ortalamanın altı"
    return "Zayıf"


def _mean(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 1) if values else None


def paired_stats(pre: List[float], post: List[float]) -> Dict[str, Any]:
    """Eşleştirilmiş t-testi, Wilcoxon ve Cohen's dz. n<2 ya da varyans yoksa ilgili alanlar None."""
    diffs = [b - a for a, b in zip(pre, post)]
    n = len(diffs)
    out: Dict[str, Any] = {
        "n": n, "mean_pre": _mean(pre), "mean_post": _mean(post), "mean_delta": _mean(diffs),
        "improved": sum(1 for d in diffs if d > 0), "declined": sum(1 for d in diffs if d < 0),
        "t": None, "p_ttest": None, "p_wilcoxon": None, "cohens_dz": None,
    }
    if n < 2:
        return out
    mean_d = sum(diffs) / n
    sd = math.sqrt(sum((d - mean_d) ** 2 for d in diffs) / (n - 1))
    if sd > 0:
        out["cohens_dz"] = round(mean_d / sd, 2)
        try:
            from scipy import stats
            t = stats.ttest_rel(post, pre)
            out["t"], out["p_ttest"] = round(float(t.statistic), 3), round(float(t.pvalue), 4)
        except Exception:
            pass
    if any(d != 0 for d in diffs):
        try:
            from scipy import stats
            out["p_wilcoxon"] = round(float(stats.wilcoxon(diffs).pvalue), 4)
        except Exception:
            pass
    return out


def build_report(participants: List[Dict[str, Any]], interviews: List[Dict[str, Any]],
                 analytics: Dict[str, Dict[str, Any]], surveys: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    participants: onam sırasına göre [{user_id, granted_at}] (takma adlar bu sıradan).
    Dönüş kimliksizdir: user_id içermez.
    """
    by_user: Dict[str, List[Dict[str, Any]]] = {}
    for inv in interviews:
        by_user.setdefault(str(inv["user_id"]), []).append(inv)
    sus_by_user = {str(s["user_id"]): s for s in surveys if s["kind"] == "sus"}
    post = [s for s in surveys if s["kind"] == "post_interview"]

    rows, pre, post_scores, pre2, post2 = [], [], [], [], []
    for i, p in enumerate(participants, start=1):
        uid = str(p["user_id"])
        timeline = progress_service.build_timeline(by_user.get(uid, []), analytics)
        scores = [t["average"] for t in timeline]
        row = {
            "participant": f"P{i:02d}",
            "interviews": len(scores),
            "first": scores[0] if scores else None,
            "last": scores[-1] if len(scores) >= 2 else None,
            "delta": round(scores[-1] - scores[0], 1) if len(scores) >= 2 else None,
            "first2": _mean(scores[:2]) if len(scores) >= 4 else None,
            "last2": _mean(scores[-2:]) if len(scores) >= 4 else None,
            "sus": float(sus_by_user[uid]["score"]) if uid in sus_by_user and sus_by_user[uid].get("score") is not None else None,
            "post_surveys": sum(1 for s in post if str(s["user_id"]) == uid),
        }
        rows.append(row)
        if row["delta"] is not None:
            pre.append(row["first"])
            post_scores.append(row["last"])
        if row["first2"] is not None:
            pre2.append(row["first2"])
            post2.append(row["last2"])

    sus_values = [r["sus"] for r in rows if r["sus"] is not None]
    item_means = {
        key: _mean([float(s["answers"][key]) for s in post if isinstance(s.get("answers"), dict) and key in s["answers"]])
        for key in POST_ITEMS
    }
    return {
        "participants": len(rows),
        "with_pre_post": len(pre),
        "first_last": paired_stats(pre, post_scores),
        "first2_last2": paired_stats(pre2, post2),
        "sus": {"n": len(sus_values), "mean": _mean(sus_values), "grade": sus_grade(_mean(sus_values))},
        "post_interview": {"n": len(post), "items": [{"key": k, "label": POST_ITEMS[k], "mean": item_means[k]} for k in POST_ITEMS]},
        "rows": rows,
    }


# --- veritabanı ---

def _consent_row(user_id: str) -> Optional[Dict[str, Any]]:
    rows = (
        _db().table("user_consents").select("granted_at, revoked_at")
        .eq("user_id", user_id).eq("consent_type", CONSENT_TYPE).execute().data or []
    )
    return rows[0] if rows else None


def has_consent(user_id: str) -> bool:
    row = _consent_row(user_id)
    return bool(row) and row.get("revoked_at") is None


def set_consent(user_id: str, granted: bool) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    if granted:
        _db().table("user_consents").upsert({
            "user_id": user_id, "consent_type": CONSENT_TYPE, "version": CONSENT_VERSION,
            "granted_at": now, "revoked_at": None,
        }, on_conflict="user_id,consent_type").execute()
        return True
    # Geri çekilme: anket yanıtları silinir, kişi rapordan çıkar.
    _db().table("survey_responses").delete().eq("user_id", user_id).execute()
    _db().table("user_consents").update({"revoked_at": now}).eq("user_id", user_id).eq("consent_type", CONSENT_TYPE).execute()
    return False


def _completed_interviews(user_id: str) -> List[Dict[str, Any]]:
    return (
        _db().table("interviews").select("id, role, topic, created_at")
        .eq("user_id", user_id).eq("status", "completed").order("created_at", desc=True).execute().data or []
    )


def my_status(user_id: str) -> Dict[str, Any]:
    consent = has_consent(user_id)
    status: Dict[str, Any] = {
        "consent": consent, "consent_text": CONSENT_TEXT, "consent_version": CONSENT_VERSION,
        "sus_items": SUS_ITEMS, "post_items": [{"key": k, "label": v} for k, v in POST_ITEMS.items()],
        "completed_interviews": 0, "sus_score": None, "pending_surveys": [],
    }
    if not consent:
        return status
    interviews = _completed_interviews(user_id)
    responses = _db().table("survey_responses").select("kind, interview_id, score").eq("user_id", user_id).execute().data or []
    answered = {str(r["interview_id"]) for r in responses if r["kind"] == "post_interview"}
    sus = next((r for r in responses if r["kind"] == "sus"), None)
    status.update({
        "completed_interviews": len(interviews),
        "sus_score": float(sus["score"]) if sus and sus.get("score") is not None else None,
        # Yalnızca son 5 mülakat için anket istenir (eski mülakatları hatırlamak güvenilir değil).
        "pending_surveys": [i for i in interviews[:5] if str(i["id"]) not in answered],
    })
    return status


def submit_post_interview(user_id: str, interview_id: str, answers: Dict[str, int], comment: Optional[str]) -> None:
    if not has_consent(user_id):
        raise PermissionError("Anket yalnızca pilot çalışmaya katılan kullanıcılardan alınır.")
    owned = (
        _db().table("interviews").select("id").eq("id", interview_id).eq("user_id", user_id)
        .eq("status", "completed").execute().data
    )
    if not owned:
        raise ValueError("Tamamlanmış mülakat bulunamadı")
    record = {
        "user_id": user_id, "kind": "post_interview", "interview_id": interview_id,
        "answers": answers, "score": _mean([float(v) for v in answers.values()]), "comment": comment,
    }
    # Kısmi benzersiz indeks upsert ile hedeflenemediği için sil + ekle (yanıt güncellenebilir).
    _db().table("survey_responses").delete().eq("user_id", user_id).eq("kind", "post_interview").eq("interview_id", interview_id).execute()
    _db().table("survey_responses").insert(record).execute()


def submit_sus(user_id: str, answers: List[int]) -> float:
    if not has_consent(user_id):
        raise PermissionError("Anket yalnızca pilot çalışmaya katılan kullanıcılardan alınır.")
    score = sus_score(answers)
    _db().table("survey_responses").delete().eq("user_id", user_id).eq("kind", "sus").execute()
    _db().table("survey_responses").insert({"user_id": user_id, "kind": "sus", "answers": answers, "score": score}).execute()
    return score


def fetch_report() -> Dict[str, Any]:
    consents = (
        _db().table("user_consents").select("user_id, granted_at")
        .eq("consent_type", CONSENT_TYPE).is_("revoked_at", "null").order("granted_at").execute().data or []
    )
    ids = [str(c["user_id"]) for c in consents]
    if not ids:
        return build_report([], [], {}, [])
    interviews = (
        _db().table("interviews").select(progress_service._INTERVIEW_COLUMNS)
        .in_("user_id", ids).eq("status", "completed").order("created_at").execute().data or []
    )
    analytics = progress_service._fetch_analytics([i["id"] for i in interviews])
    surveys = _db().table("survey_responses").select("user_id, kind, answers, score").in_("user_id", ids).execute().data or []
    return build_report(consents, interviews, analytics, surveys)


def report_csv(report: Dict[str, Any]) -> str:
    from app.services.org_export_service import to_csv
    return to_csv(
        ["Katılımcı", "Mülakat sayısı", "İlk skor", "Son skor", "Fark", "İlk 2 ort.", "Son 2 ort.", "SUS", "Mülakat anketi sayısı"],
        ([r["participant"], r["interviews"], r["first"], r["last"], r["delta"], r["first2"], r["last2"], r["sus"], r["post_surveys"]]
         for r in report["rows"]),
    )
