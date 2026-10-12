"""
İlan ↔ CV eşleşmesi — deterministik ve AÇIKLANABİLİR (LLM yok).

Beceriler sadeleştirilip (Türkçe karakter, büyük/küçük harf, nokta/tire,
sürüm numarası) eş anlamlılarla tek bir anahtara indirgenir: "React.js",
"ReactJS" ve "react 18" aynı beceridir. Her ilan becerisi için durum:
  - matched : CV'nin beceri/proje teknoloji listesinde var (tam puan)
  - in_text : listede yok ama CV metninde geçiyor (yarım puan — muhtemelen
              biliyor ama CV'de öne çıkarmamış)
  - missing : hiçbir yerde yok

Skor bileşenleri (yalnızca mevcut olanlar sayılır, ağırlıklar yeniden
normalize edilir): zorunlu beceriler %70, tercih edilenler %15, deneyim %15.
"""
import re
from typing import Any, Dict, Iterable, List, Optional

from app.services.ats_service import fold

# Sadeleştirilmiş anahtar -> kanonik anahtar.
ALIASES = {
    "js": "javascript", "es6": "javascript", "ecmascript": "javascript",
    "ts": "typescript",
    "reactjs": "react", "reactnative": "reactnative",
    "nodejs": "node", "node": "node",
    "nextjs": "next", "next": "next",
    "vuejs": "vue", "nuxtjs": "nuxt", "angularjs": "angular",
    "postgres": "postgresql", "psql": "postgresql",
    "mongo": "mongodb",
    "mssql": "sqlserver", "microsoftsqlserver": "sqlserver",
    "k8s": "kubernetes",
    "golang": "go",
    "py": "python", "python3": "python",
    "html5": "html", "css3": "css",
    "tailwindcss": "tailwind",
    "restapi": "rest", "restful": "rest", "restfulapi": "rest", "restapis": "rest",
    "amazonwebservices": "aws",
    "googlecloud": "gcp", "googlecloudplatform": "gcp",
    "microsoftazure": "azure",
    "dotnet": "net", "netcore": "net", "aspnetcore": "aspnet",
    "ml": "machinelearning", "makineogrenmesi": "machinelearning",
    "derinogrenme": "deeplearning", "dl": "deeplearning",
    "cicd": "cicd", "ci": "cicd",
    "unittest": "unittesting", "birimtesti": "unittesting",
    "git": "git", "github": "git", "gitlab": "git",
}

_VERSION_RE = re.compile(r"\s+v?\d+(\.\d+)*\s*$")
_STRIP_RE = re.compile(r"[\s.\-_/()]")

SHORT_KEY_LEN = 2  # "go", "c", "r" gibi kısa anahtarlar metin içinde aranmaz (yanlış pozitif riski)


def skill_key(skill: str) -> str:
    s = _VERSION_RE.sub("", fold(str(skill or "")).strip())
    key = _STRIP_RE.sub("", s)
    return ALIASES.get(key, key)


def _keys(skills: Iterable[str]) -> Dict[str, str]:
    """anahtar -> CV'deki orijinal yazım."""
    out: Dict[str, str] = {}
    for s in skills:
        if isinstance(s, str) and s.strip():
            out.setdefault(skill_key(s), s.strip())
    return out


def _in_text(skill: str, folded_text: str) -> bool:
    if len(skill_key(skill)) <= SHORT_KEY_LEN:
        return False
    needle = _VERSION_RE.sub("", fold(skill).strip())
    if len(needle) < 3:
        return False
    return re.search(rf"(?<![\w]){re.escape(needle)}(?![\w])", folded_text) is not None


def _match_list(required: List[str], cv_keys: Dict[str, str], folded_text: str) -> List[Dict[str, Any]]:
    results = []
    seen = set()
    for skill in required:
        if not isinstance(skill, str) or not skill.strip():
            continue
        key = skill_key(skill)
        if key in seen:
            continue
        seen.add(key)
        if key in cv_keys:
            results.append({"skill": skill.strip(), "status": "matched", "matched_with": cv_keys[key]})
        elif _in_text(skill, folded_text):
            results.append({"skill": skill.strip(), "status": "in_text", "matched_with": None})
        else:
            results.append({"skill": skill.strip(), "status": "missing", "matched_with": None})
    return results


def _coverage(items: List[Dict[str, Any]]) -> float:
    if not items:
        return 0.0
    points = sum(1.0 if i["status"] == "matched" else 0.5 if i["status"] == "in_text" else 0.0 for i in items)
    return points / len(items)


def cv_skill_list(profile: Dict[str, Any]) -> List[str]:
    skills = list(profile.get("skills") or [])
    for proj in profile.get("projects") or []:
        skills.extend(t for t in (proj.get("tech") or []) if isinstance(t, str))
    return skills


def compute_match(requirements: Dict[str, Any], profile: Dict[str, Any], cv_text: str) -> Dict[str, Any]:
    cv_keys = _keys(cv_skill_list(profile))
    folded_text = fold(cv_text or "")

    required = _match_list(requirements.get("required_skills") or [], cv_keys, folded_text)
    nice = _match_list(requirements.get("nice_to_have_skills") or [], cv_keys, folded_text)

    components = []
    if required:
        components.append({"id": "required", "label": "Zorunlu beceriler", "weight": 70,
                           "earned": round(70 * _coverage(required), 1)})
    if nice:
        components.append({"id": "nice", "label": "Tercih edilen beceriler", "weight": 15,
                           "earned": round(15 * _coverage(nice), 1)})

    min_years = requirements.get("min_years_experience")
    cand_years: Optional[int] = profile.get("experience_years")
    experience: Dict[str, Any] = {"required_min": min_years, "candidate_years": cand_years, "status": "n/a"}
    if isinstance(min_years, int) and min_years > 0:
        if cand_years is None:
            earned, experience["status"] = 7.5, "unknown"
        elif cand_years >= min_years:
            earned, experience["status"] = 15, "meets"
        elif cand_years >= min_years - 1:
            earned, experience["status"] = 8, "close"
        else:
            earned, experience["status"] = 0, "below"
        components.append({"id": "experience", "label": "Deneyim yılı", "weight": 15, "earned": earned})

    total_weight = sum(c["weight"] for c in components)
    score = round(100 * sum(c["earned"] for c in components) / total_weight) if total_weight else 0

    return {
        "match_score": score,
        "required": required,
        "nice_to_have": nice,
        "experience": experience,
        "components": components,
        "missing_required": [i["skill"] for i in required if i["status"] == "missing"],
        "missing_nice": [i["skill"] for i in nice if i["status"] == "missing"],
        "underlisted": [i["skill"] for i in required + nice if i["status"] == "in_text"],
    }
