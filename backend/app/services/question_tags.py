"""
Soru bankası için beceri etiketleri: bir mülakatın rol/konu metninden hangi
etiketlerin arandığını DETERMİNİSTİK olarak çıkarır.

Neden: embedding benzerliği tek başına "bu soru bu konuya ait mi" sorusunu güvenilir
ayırt edemiyor (canlı ölçüm, 2026-10-12: "Backend Developer / Python / ORTA" sorgusu
bankadaki kendi Python sorularına 0.18 benzerlik verip eşiğin altında kaldı; "Veri
Yapıları" sorgusu alakasız bir ML sorusuna 0.24 verip eşiği geçti). Etiket örtüşmesi
yanlış konudan soru gelmesini engeller; embedding yalnızca etiketin yetmediği serbest
metin konularda yedek olarak kullanılır (bkz. question_bank_service.fetch_question_pool).

Etiketler ilan eşleştirmedeki `skill_key` ile aynı kanonik anahtarlardır ("React.js",
"reactjs" -> "react"), böylece CV/ilan becerileri de aynı sözlükle eşleşir.
"""
import re
from typing import Iterable, List, Optional, Set, Tuple

from app.services.ats_service import fold
from app.services.skill_matching import skill_key

# Bankada kullanılan kanonik etiketler (backend/data/question_bank_v2.json bunlardan seçer).
KNOWN_TAGS: Set[str] = {
    # diller ve çatılar
    "python", "java", "spring", "javascript", "typescript", "react", "next", "html", "css",
    "node", "net", "csharp", "go", "kotlin", "swift", "dart", "flutter", "android", "ios",
    "reactnative", "fastapi", "django",
    # veri
    "sql", "postgresql", "mongodb", "redis", "veritabani", "verianalizi", "pandas",
    "machinelearning", "deeplearning",
    # temeller
    "oop", "solid", "veriyapilari", "algoritma", "karmasiklik", "tasarimkaliplari",
    "rest", "http", "git", "guvenlik", "concurrency", "async", "sistemtasarimi",
    # altyapı ve kalite
    "docker", "kubernetes", "cicd", "linux", "aws", "cloud", "test", "unittesting",
    "testotomasyonu", "performans",
    # davranışsal
    "davranissal",
}

# Etikete çözülemeyen ama konu metninde geçebilen ifadeler (katlanmış, küçük harf).
_PHRASES = {
    "veri yapi": "veriyapilari", "data structure": "veriyapilari",
    "algoritma": "algoritma", "algorithm": "algoritma",
    "nesne yonelimli": "oop", "object oriented": "oop", "oop": "oop",
    "solid": "solid", "tasarim kalib": "tasarimkaliplari", "design pattern": "tasarimkaliplari",
    "veritaban": "veritabani", "database": "veritabani",
    "veri analiz": "verianalizi", "data analy": "verianalizi",
    "makine ogrenme": "machinelearning", "machine learning": "machinelearning", "yapay zeka": "machinelearning",
    "derin ogrenme": "deeplearning", "deep learning": "deeplearning",
    "sistem tasarim": "sistemtasarimi", "system design": "sistemtasarimi",
    "guvenlik": "guvenlik", "security": "guvenlik",
    "test otomasyon": "testotomasyonu", "test automation": "testotomasyonu",
    "yazilim test": "test", "software test": "test", "kalite guvence": "test",
    "davranissal": "davranissal", "behavioral": "davranissal", "star": "davranissal",
    "spring": "spring", "asp.net": "net", ".net": "net", "c#": "csharp",
    "react native": "reactnative",
}

# Rol metninden çıkarılan, konudan daha zayıf (yalnızca sıralamaya katkı veren) etiketler.
_ROLE_HINTS = [
    (("frontend", "front-end", "front end", "on yuz", "onyuz", "web gelistir"), ("javascript", "react", "html", "css", "typescript")),
    (("backend", "back-end", "back end", "arka yuz", "sunucu"), ("rest", "sql", "veritabani", "http")),
    (("full stack", "fullstack", "full-stack"), ("javascript", "react", "rest", "sql")),
    (("mobil", "mobile", "android", "ios"), ("flutter", "android", "kotlin", "reactnative")),
    (("devops", "sre", "platform", "bulut", "cloud"), ("docker", "cicd", "linux", "kubernetes")),
    (("test", "qa", "kalite"), ("test", "testotomasyonu", "unittesting")),
    (("veri bilim", "data scien", "makine ogrenme", "machine learning", "ml "), ("machinelearning", "python", "verianalizi")),
    (("veri analist", "data analyst", "is analist", "business analyst"), ("sql", "verianalizi", "veritabani")),
    (("yazilim", "software", "gelistirici", "developer", "muhendis", "engineer", "stajyer", "intern"), ("oop", "veriyapilari", "git", "rest")),
]

# Bir konunun alt teknolojileri: sıralamada "ilgisiz etiket" sayılmazlar
# (ör. Python mülakatında FastAPI sorusu konu dışı değildir).
RELATED: dict = {
    "python": {"fastapi", "django", "async", "concurrency", "pandas"},
    "javascript": {"node", "react", "typescript", "next", "async"},
    "typescript": {"javascript"},
    "react": {"next", "javascript", "performans"},
    "java": {"spring", "concurrency"},
    "csharp": {"net", "async"},
    "net": {"csharp"},
    "node": {"javascript", "async"},
    "sql": {"veritabani", "postgresql"},
    "veritabani": {"sql", "postgresql", "mongodb", "redis"},
    "flutter": {"dart"},
    "android": {"kotlin"},
    "docker": {"kubernetes", "cicd", "linux"},
    "machinelearning": {"deeplearning", "pandas"},
    "veriyapilari": {"algoritma", "karmasiklik"},
    "algoritma": {"veriyapilari", "karmasiklik"},
}


def related_tags(tags: Iterable[str]) -> Set[str]:
    out: Set[str] = set()
    for t in tags:
        out |= RELATED.get(t, set())
    return out


_SPLIT_RE = re.compile(r"\s*(?:,|/|&|\+|;|\|| ve | and | ile | or | veya )\s*")


def _phrase_tags(folded: str) -> Set[str]:
    padded = f" {folded} "
    return {tag for phrase, tag in _PHRASES.items() if phrase in padded}


def tags_from_text(text: Optional[str]) -> Set[str]:
    """Serbest metinden (konu, beceri) bilinen etiketleri çıkarır."""
    if not text:
        return set()
    folded = fold(text)
    found = {k for part in _SPLIT_RE.split(folded) if (k := skill_key(part)) in KNOWN_TAGS}
    # Tek kelimelik beceriler cümle içinde de geçebilir ("Python ile backend").
    found |= {k for word in re.split(r"[\s,/&+;|()]+", folded) if (k := skill_key(word)) in KNOWN_TAGS}
    return found | _phrase_tags(folded)


def role_tags(role: Optional[str]) -> Set[str]:
    folded = f" {fold(role or '')} "
    out: Set[str] = set()
    for needles, tags in _ROLE_HINTS:
        if any(n in folded for n in needles):
            out.update(tags)
    return out | tags_from_text(role)


def interview_tags(role: str, topic: str, skills_hint: Optional[Iterable[str]] = None) -> Tuple[Set[str], Set[str]]:
    """
    (konu etiketleri, rol etiketleri). Konu etiketleri soru seçiminde belirleyicidir;
    rol etiketleri ve CV/ilan becerileri yalnızca sıralamaya katkı verir.
    """
    topic_tags = tags_from_text(topic)
    weak = role_tags(role) | {k for s in (skills_hint or []) if (k := skill_key(s)) in KNOWN_TAGS}
    return topic_tags, weak - topic_tags


def normalize_tags(tags: Iterable[str]) -> List[str]:
    """Bankaya yazılacak etiketleri kanonikleştirir; bilinmeyenleri ayıklar (sessizce)."""
    out: List[str] = []
    for t in tags or []:
        k = skill_key(t)
        if k in KNOWN_TAGS and k not in out:
            out.append(k)
    return out
