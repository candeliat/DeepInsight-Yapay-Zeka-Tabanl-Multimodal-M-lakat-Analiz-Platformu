"""
STAR koçluğu — davranışsal mülakat cevaplarının kural tabanlı, AÇIKLANABİLİR analizi.

STAR: Situation (durum), Task (görev), Action (eylem), Result (sonuç). Dayanak:
docs/research/MULAKAT_VE_ATS_ARASTIRMASI.md §3 —
- Durum anlatımı cevabın yaklaşık %20'si, görev %10'u; ağırlık eylem ve sonuçtadır
  (University of Washington). Ağırlıklar buna göre: S 20, T 15, A 35, R 30.
- Genellemeler yerine somut örnek ve "ben" cümleleri (MIT CAPD / Dartmouth).

Bu bir koçluk ipucudur, puan değildir: Türkçe ifadeler çok çeşitli olduğu için işaretler
yaklaşıktır ve aday yönlendirilir, cezalandırılmaz. LLM kullanılmaz: anlık, ücretsiz,
aynı cevap her zaman aynı sonucu verir.
"""
import re
from typing import Any, Dict, List

from app.services.ats_service import fold
from app.services.question_tags import tags_from_text

WEIGHTS = {"situation": 20, "task": 15, "action": 35, "result": 30}
LABELS = {"situation": "Durum", "task": "Görev", "action": "Eylem", "result": "Sonuç"}
MIN_WORDS = 60

_SITUATION = (
    "projede", "projemizde", "bir proje", "calistigim", "calisirken", "stajimda", "staj ", "sirkette",
    "ekibimde", "ekipte", "o donem", "o zaman", "gecen yil", "gecen donem", "bir gun", "universitede",
    "derste", "musteri", "sirasinda", "durumda", "kriz", "sorun cikti", "problem yasad",
)
_TASK = (
    "gorevim", "gorevimiz", "sorumlulug", "hedefim", "hedefimiz", "amacim", "amacimiz", "benden",
    "gerekiyordu", "beklen", "istendi", "yapmam gerek", "cozmem gerek", "teslim etmem", "zorundaydim",
)
_RESULT = (
    "sonuc", "sonunda", "boylece", "bu sayede", "bunun sayesinde", "basari", "azald", "artt", "kisald",
    "hizland", "duzeldi", "cozuldu", "tamamlad", "kazand", "ogrendim", "ogrendik", "geri bildirim",
    "takdir", "yayina", "teslim ettik", "teslim ettim",
)
# Birinci tekil / çoğul geçmiş zaman fiilleri (sadeleştirilmiş: yaptım -> yaptim, ettik).
_I_VERB = re.compile(r"\b\w{2,}[dt][iu]m\b")
_WE_VERB = re.compile(r"\b\w{2,}[dt][iu]k\b")
_NUMBER = re.compile(r"\d")
_WORD = re.compile(r"\w+", re.UNICODE)


def is_behavioral(topic: str) -> bool:
    return "davranissal" in tags_from_text(topic or "")


def _has(text: str, cues) -> bool:
    return any(c in text for c in cues)


def analyze_answer(answer: str) -> Dict[str, Any]:
    folded = fold(answer or "")
    words = len(_WORD.findall(folded))
    i_verbs = len(_I_VERB.findall(folded)) + folded.split().count("ben")
    we_verbs = len(_WE_VERB.findall(folded)) + folded.split().count("biz")

    components = {
        "situation": _has(folded, _SITUATION),
        "task": _has(folded, _TASK),
        "action": len(_I_VERB.findall(folded)) >= 2 or (len(_WE_VERB.findall(folded)) >= 2 and _has(folded, ("ben ", "benim"))),
        "result": _has(folded, _RESULT),
    }
    # Sonuçta sayı geçiyor mu: sonuç işaretinden sonraki kısımda rakam aranır.
    result_start = min((folded.find(c) for c in _RESULT if c in folded), default=-1)
    quantified = result_start >= 0 and bool(_NUMBER.search(folded[result_start:]))

    voice = "ben" if i_verbs > we_verbs else ("biz" if we_verbs > i_verbs else "karisik")

    # Öncelik ağırlık sırasında: eylem ve sonuç cevabın asıl kısmıdır (UW), en fazla 3 ipucu.
    tips: List[str] = []
    if not components["action"]:
        tips.append("Senin attığın adımları 'yaptım, önerdim, düzelttim' gibi ben-diliyle sırala; cevabın en uzun kısmı bu olmalı.")
    elif voice == "biz":
        tips.append("Çoğunlukla 'biz' dedin: ekibin değil, senin katkını 'ben' diliyle öne çıkar.")
    if not components["result"]:
        tips.append("Hikâyeyi bir sonuçla bitir: ne değişti, ne öğrendin?")
    elif not quantified:
        tips.append("Sonucu ölçülebilir yap: süre, yüzde, kullanıcı sayısı gibi bir rakam ekle.")
    if not components["situation"]:
        tips.append("Kısa bir bağlamla başla: hangi projede/ekipte, ne zaman? (cevabın ~%20'si yeterli)")
    if not components["task"]:
        tips.append("Senden beklenen neydi? Görevini ya da hedefini bir cümleyle söyle.")
    if words < MIN_WORDS:
        tips.append("Cevap kısa kaldı; somut bir örnekle 1-2 dakika anlatmayı hedefle.")

    return {
        "components": components,
        "score": sum(WEIGHTS[k] for k, ok in components.items() if ok),
        "voice": voice,
        "quantified_result": quantified,
        "word_count": words,
        "tips": tips[:3],
    }


def summarize(analyses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Mülakat boyunca STAR öğelerinin kaç cevapta yer aldığı ve en sık eksik öğe."""
    if not analyses:
        return {"answers": 0, "average": None, "coverage": {}, "weakest": None}
    coverage = {k: sum(1 for a in analyses if a["components"].get(k)) for k in WEIGHTS}
    weakest = min(WEIGHTS, key=lambda k: (coverage[k], -WEIGHTS[k]))
    return {
        "answers": len(analyses),
        "average": round(sum(a["score"] for a in analyses) / len(analyses)),
        "coverage": coverage,
        "weakest": weakest if coverage[weakest] < len(analyses) else None,
    }
