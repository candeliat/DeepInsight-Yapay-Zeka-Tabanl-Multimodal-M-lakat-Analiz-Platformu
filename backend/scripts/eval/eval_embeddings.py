"""
Akademik ölçüm 1 — Soru bankası retrieval'i: API embedding modeli
(nvidia/nemotron-3-embed-1b) ile yerel model (intfloat/multilingual-e5-base)
karşılaştırması.

Yöntem
- Derlem: soru bankasındaki tüm global sorular; her sorunun iki vektörü zaten
  veritabanında (embedding = API, embedding_local = e5).
- Sorgular: her konu için 5 sorgu biçimi — üretimdeki şablon, yalnız konu adı,
  Türkçe yeniden ifade, İngilizce, CV-beceri ipucu. Böylece modelin yalnızca
  birebir kelime eşleşmesine değil anlamsal benzerliğe dayanıp dayanmadığı ölçülür.
- İlgililik: sorunun konusu sorgunun konusuyla aynıysa ilgili (ikili).
  Not: "JavaScript" ve "React ve Modern Web Geliştirme" konuları anlamca yakındır;
  bu, modelleri ayırt etmeyi zorlaştıran bilinçli bir sınamadır.
- Metrikler: Top-1 doğruluğu, P@5, MRR, nDCG@10; sorgu başına süre ve hata oranı.

Çalıştırma (backend/ dizininden):
    python -m scripts.eval.eval_embeddings
Çıktı: docs/evaluation/embeddings.json ve embeddings.md
"""
import asyncio
import json
import math
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.core.database import supabase  # noqa: E402
from app.services.llm_service import llm_service  # noqa: E402
from app.services.local_embedding_service import embed_text_local  # noqa: E402

OUT_DIR = ROOT.parent / "docs" / "evaluation"

TEMPLATE = "{role} pozisyonu için {topic} konusunda teknik mülakat sorusu"
QUERIES: Dict[str, Dict[str, str]] = {
    "Python": {
        "kisa": "Python",
        "yeniden_ifade": "Python ile sunucu tarafı yazılım geliştirme mülakatı",
        "ingilizce": "Python backend developer interview questions",
        "beceri": "Backend Developer pozisyonu için teknik mülakat sorusu. Adayın becerileri: Django, FastAPI, asyncio, PostgreSQL",
    },
    "JavaScript": {
        "kisa": "JavaScript",
        "yeniden_ifade": "tarayıcıda çalışan dil, closure ve event loop soruları",
        "ingilizce": "JavaScript frontend interview questions",
        "beceri": "Frontend Developer pozisyonu için teknik mülakat sorusu. Adayın becerileri: TypeScript, DOM, Promise, ES6",
    },
    "Makine Öğrenmesi": {
        "kisa": "Makine Öğrenmesi",
        "yeniden_ifade": "yapay zeka modellerinin eğitimi ve başarısının değerlendirilmesi",
        "ingilizce": "machine learning data scientist interview questions",
        "beceri": "Veri Bilimci pozisyonu için teknik mülakat sorusu. Adayın becerileri: scikit-learn, pandas, regresyon, overfitting",
    },
    "React ve Modern Web Geliştirme": {
        "kisa": "React",
        "yeniden_ifade": "React hook'ları ve bileşen tabanlı arayüz geliştirme",
        "ingilizce": "React web development interview questions",
        "beceri": "Yazılım Mühendisi pozisyonu için teknik mülakat sorusu. Adayın becerileri: Next.js, JSX, state yönetimi",
    },
}


def _vec(value: Any) -> List[float]:
    if isinstance(value, str):
        value = json.loads(value)
    return [float(x) for x in value]


def _cos(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def metrics(relevance: List[int], k_p: int = 5, k_ndcg: int = 10) -> Dict[str, float]:
    """Sıralı ilgililik listesinden (1/0) metrikler."""
    first = next((i for i, r in enumerate(relevance) if r), None)
    dcg = sum(r / math.log2(i + 2) for i, r in enumerate(relevance[:k_ndcg]))
    ideal = sorted(relevance, reverse=True)
    idcg = sum(r / math.log2(i + 2) for i, r in enumerate(ideal[:k_ndcg]))
    return {
        "top1": float(relevance[0]) if relevance else 0.0,
        "p_at_5": sum(relevance[:k_p]) / k_p,
        "mrr": 1 / (first + 1) if first is not None else 0.0,
        "ndcg_at_10": dcg / idcg if idcg else 0.0,
    }


def _mean(values: List[float]) -> float:
    return round(sum(values) / len(values), 3) if values else 0.0


async def main() -> None:
    rows = (
        supabase.table("question_bank").select("id, role, topic, embedding, embedding_local")
        .is_("org_id", "null").execute().data or []
    )
    rows = [r for r in rows if r.get("embedding") and r.get("embedding_local")]
    corpus = {
        "api": [(r["topic"], _vec(r["embedding"])) for r in rows],
        "local": [(r["topic"], _vec(r["embedding_local"])) for r in rows],
    }
    roles = {r["topic"]: r["role"] for r in rows}

    queries = []
    for topic, styles in QUERIES.items():
        if topic not in roles:
            continue
        queries.append((topic, "uretim_sablonu", TEMPLATE.format(role=roles[topic], topic=topic)))
        queries.extend((topic, style, text) for style, text in styles.items())

    results: Dict[str, Any] = {"corpus_size": len(rows), "query_count": len(queries), "models": {}}
    for model in ("api", "local"):
        per_query, failures, durations = [], 0, []
        for topic, style, text in queries:
            started = time.perf_counter()
            try:
                if model == "api":
                    q = await llm_service.embed_text(text, input_type="query")
                else:
                    q = await asyncio.to_thread(embed_text_local, text)
            except Exception as e:  # API kotası/ağ hatası ölçümün bir parçasıdır
                failures += 1
                per_query.append({"topic": topic, "style": style, "error": type(e).__name__})
                continue
            durations.append(time.perf_counter() - started)
            ranked = sorted(corpus[model], key=lambda item: _cos(q, item[1]), reverse=True)
            per_query.append({"topic": topic, "style": style, **metrics([int(t == topic) for t, _ in ranked])})

        ok = [p for p in per_query if "error" not in p]
        by_style: Dict[str, Dict[str, float]] = {}
        for style in sorted({p["style"] for p in ok}):
            subset = [p for p in ok if p["style"] == style]
            by_style[style] = {m: _mean([p[m] for p in subset]) for m in ("top1", "p_at_5", "mrr", "ndcg_at_10")}
        results["models"][model] = {
            "name": "nvidia/nemotron-3-embed-1b (API)" if model == "api" else "intfloat/multilingual-e5-base (yerel)",
            "failures": failures,
            # İlk yerel çağrı modeli diskten yükler; ortalama süreye karışmasın diye medyan da verilir.
            "mean_latency_s": _mean(durations),
            "median_latency_s": round(sorted(durations)[len(durations) // 2], 3) if durations else None,
            "overall": {m: _mean([p[m] for p in ok]) for m in ("top1", "p_at_5", "mrr", "ndcg_at_10")},
            "by_style": by_style,
            "queries": per_query,
        }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "embeddings.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "embeddings.md").write_text(render_markdown(results), encoding="utf-8")
    print(render_markdown(results))


def render_markdown(r: Dict[str, Any]) -> str:
    lines = [
        "# Embedding modeli karşılaştırması (soru bankası retrieval'i)",
        "",
        f"Derlem: {r['corpus_size']} soru · Sorgu: {r['query_count']} (4 konu × 5 sorgu biçimi) · İlgililik: aynı konu.",
        "",
        "| Model | Top-1 | P@5 | MRR | nDCG@10 | Medyan süre (sn) | Hata |",
        "|---|---|---|---|---|---|---|",
    ]
    for m in r["models"].values():
        o = m["overall"]
        lines.append(f"| {m['name']} | {o['top1']:.2f} | {o['p_at_5']:.2f} | {o['mrr']:.2f} | {o['ndcg_at_10']:.2f} | "
                     f"{m['median_latency_s'] if m['median_latency_s'] is not None else '—'} | {m['failures']}/{r['query_count']} |")
    lines += ["", "## Sorgu biçimine göre P@5", "", "| Sorgu biçimi | " + " | ".join(m["name"] for m in r["models"].values()) + " |",
              "|---|" + "---|" * len(r["models"])]
    styles = sorted({s for m in r["models"].values() for s in m["by_style"]})
    for s in styles:
        cells = [f"{m['by_style'][s]['p_at_5']:.2f}" if s in m["by_style"] else "—" for m in r["models"].values()]
        lines.append(f"| {s} | " + " | ".join(cells) + " |")
    lines += ["", "Notlar: P@5'in üst sınırı konudaki soru sayısına bağlıdır (Makine Öğrenmesi'nde 3 soru → en fazla 0,60); "
              "bu yüzden nDCG@10 birincil metrik olarak okunmalıdır. Derlem küçüktür (konu başına 3-11 soru); sonuçlar "
              "yön göstericidir, genellenebilir değildir."]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    asyncio.run(main())
