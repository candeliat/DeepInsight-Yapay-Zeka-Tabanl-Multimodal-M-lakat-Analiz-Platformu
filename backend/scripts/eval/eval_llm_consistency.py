"""
Akademik ölçüm 2 — LLM değerlendiricinin tutarlılığı ve geçerliliği.

Yöntem
- Kalitesi bilinen sentetik mülakat dökümleri (fixtures/synthetic_interviews.json):
  2 konu × 3 kalite düzeyi (iyi=3, orta=2, zayıf=1). Gerçek kullanıcı verisi
  kullanılmaz.
- Her döküm üretimdeki değerlendirme fonksiyonuyla (llm_service.get_final_evaluation)
  K kez bağımsız puanlanır.
- Tutarlılık (test-tekrar): döküm içi standart sapma, tekrarların döküm
  ortalamasına ±5 / ±10 puan içinde kalma oranı ve ICC(2,1) — iki yönlü rastgele
  etkiler, mutlak uyum, tek ölçüm (Shrout & Fleiss, 1979).
- Geçerlilik: amaçlanan kalite düzeyi ile ortalama puan arasındaki Spearman
  korelasyonu ve her konuda iyi > orta > zayıf sıralamasının korunma oranı.

Çalıştırma (backend/ dizininden):
    python -m scripts.eval.eval_llm_consistency --repeats 3
Çıktı: docs/evaluation/llm_consistency.json ve llm_consistency.md
"""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.services.llm_service import llm_service  # noqa: E402

OUT_DIR = ROOT.parent / "docs" / "evaluation"
FIXTURES = Path(__file__).parent / "fixtures" / "synthetic_interviews.json"
METRICS = ("technical_score", "confidence_score", "vocabulary_score")


def history_for(item: Dict[str, Any]) -> List[Dict[str, str]]:
    history = [{"role": "user", "content": "Mülakatı başlat."}]
    for question, answer in item["turns"]:
        history += [{"role": "model", "content": question}, {"role": "user", "content": answer}]
    return history


def icc_2_1(matrix: List[List[float]]) -> Optional[float]:
    """ICC(2,1): satırlar = hedefler (dökümler), sütunlar = tekrarlar (puanlayıcı rolünde)."""
    n, k = len(matrix), len(matrix[0]) if matrix else 0
    if n < 2 or k < 2:
        return None
    grand = sum(sum(r) for r in matrix) / (n * k)
    row_means = [sum(r) / k for r in matrix]
    col_means = [sum(matrix[i][j] for i in range(n)) / n for j in range(k)]
    ss_rows = k * sum((m - grand) ** 2 for m in row_means)
    ss_cols = n * sum((m - grand) ** 2 for m in col_means)
    ss_total = sum((x - grand) ** 2 for r in matrix for x in r)
    ss_err = ss_total - ss_rows - ss_cols
    msr, msc = ss_rows / (n - 1), ss_cols / (k - 1)
    mse = ss_err / ((n - 1) * (k - 1))
    denom = msr + (k - 1) * mse + k * (msc - mse) / n
    return round((msr - mse) / denom, 3) if denom else None


def spearman(x: List[float], y: List[float]) -> Optional[float]:
    try:
        from scipy import stats
        return round(float(stats.spearmanr(x, y).statistic), 3)
    except Exception:
        return None


def _sd(values: List[float]) -> float:
    m = sum(values) / len(values)
    return (sum((v - m) ** 2 for v in values) / (len(values) - 1)) ** 0.5 if len(values) > 1 else 0.0


async def main(repeats: int) -> None:
    items = json.loads(FIXTURES.read_text(encoding="utf-8"))
    runs: Dict[str, List[Dict[str, Any]]] = {}
    failures = 0
    for item in items:
        runs[item["id"]] = []
        for r in range(repeats):
            started = time.perf_counter()
            try:
                ev = await llm_service.get_final_evaluation(history_for(item), item["role"], item["topic"])
            except Exception as e:
                failures += 1
                print(f"{item['id']} #{r + 1}: HATA {type(e).__name__}")
                continue
            scores = {m: float(ev.get(m) or 0) for m in METRICS}
            scores["average"] = round(sum(scores.values()) / 3, 1)
            scores["seconds"] = round(time.perf_counter() - started, 1)
            runs[item["id"]].append(scores)
            print(f"{item['id']} #{r + 1}: {scores}")

    complete = [i for i in items if len(runs[i["id"]]) == repeats]
    result: Dict[str, Any] = {"repeats": repeats, "transcripts": len(items), "failures": failures, "metrics": {}}
    for metric in METRICS + ("average",):
        matrix = [[run[metric] for run in runs[i["id"]]] for i in complete]
        within_sd = [_sd(row) for row in matrix]
        deviations = [abs(x - sum(row) / len(row)) for row in matrix for x in row]
        means = [sum(row) / len(row) for row in matrix]
        result["metrics"][metric] = {
            "icc_2_1": icc_2_1(matrix),
            "mean_within_sd": round(sum(within_sd) / len(within_sd), 2) if within_sd else None,
            "within_5": round(sum(d <= 5 for d in deviations) / len(deviations), 2) if deviations else None,
            "within_10": round(sum(d <= 10 for d in deviations) / len(deviations), 2) if deviations else None,
            "spearman_quality": spearman([i["quality"] for i in complete], means),
        }
    ordering = []
    for topic in sorted({i["topic"] for i in complete}):
        ranked = sorted((i for i in complete if i["topic"] == topic), key=lambda i: i["quality"])
        avgs = [sum(r["average"] for r in runs[i["id"]]) / repeats for i in ranked]
        ordering.append({"topic": topic, "by_quality_low_to_high": [round(a, 1) for a in avgs],
                         "monotonic": all(a < b for a, b in zip(avgs, avgs[1:]))})
    result["ordering"] = ordering
    result["per_transcript"] = {
        i["id"]: {"quality": i["quality"], "runs": runs[i["id"]]} for i in items
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "llm_consistency.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "llm_consistency.md").write_text(render_markdown(result), encoding="utf-8")
    print(render_markdown(result))


def render_markdown(r: Dict[str, Any]) -> str:
    names = {"technical_score": "Teknik", "confidence_score": "Özgüven", "vocabulary_score": "İletişim", "average": "Genel ort."}
    lines = [
        "# LLM değerlendiricinin tutarlılığı ve geçerliliği",
        "",
        f"{r['transcripts']} sentetik döküm (2 konu × iyi/orta/zayıf) × {r['repeats']} bağımsız puanlama · başarısız çağrı: {r['failures']}",
        "",
        "| Metrik | ICC(2,1) | Döküm içi ort. SS | ±5 içinde | ±10 içinde | Spearman (kalite ~ puan) |",
        "|---|---|---|---|---|---|",
    ]
    for key, m in r["metrics"].items():
        fmt = lambda v: "—" if v is None else f"{v}"  # noqa: E731
        lines.append(f"| {names[key]} | {fmt(m['icc_2_1'])} | {fmt(m['mean_within_sd'])} | {fmt(m['within_5'])} | "
                     f"{fmt(m['within_10'])} | {fmt(m['spearman_quality'])} |")
    lines += ["", "## Kalite sıralaması (zayıf → orta → iyi, genel ortalama)", ""]
    for o in r["ordering"]:
        lines.append(f"- {o['topic']}: {' → '.join(str(a) for a in o['by_quality_low_to_high'])} — "
                     f"{'sıralama korunuyor' if o['monotonic'] else 'sıralama BOZUK'}")
    lines += ["", "Yorum: ICC > 0,75 iyi, > 0,90 mükemmel güvenilirlik kabul edilir (Koo & Li, 2016). "
              "Dökümler sentetiktir; gerçek aday cevaplarındaki belirsizlik daha yüksek varyans üretebilir."]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=3)
    asyncio.run(main(parser.parse_args().repeats))
