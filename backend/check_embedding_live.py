"""
NVIDIA build.nvidia.com kataloğundaki embedding modelini GERÇEK API'ye karşı
canlı test eder (bkz. .env: LLM_BASE_URL/LLM_API_KEY). Amaç: soru bankası RAG
özelliği için `nvidia/nemotron-3-embed-1b` modelinin (canlı doğrulanmış, bkz.
GET /v1/models çıktısı) Türkçe metinlerde anlamlı semantik benzerlik ürettiğini
doğrulamak — aynı llm_service.py FREE_MODELS listesinin "sadece canlı
doğrulanmış modeller" prensibiyle tutarlı. Kota/kredi harcar, pytest'e dahil
değildir, elle çalıştırılır: `python check_embedding_live.py`
"""
import asyncio
import sys

sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from openai import AsyncOpenAI
from app.core.config import settings

MODEL = "nvidia/nemotron-3-embed-1b"

TEXTS = {
    "a_gil": "Python'da GIL (Global Interpreter Lock) nedir ve çoklu iş parçacığını nasıl etkiler?",
    "b_gil_benzer": "CPython'daki Global Interpreter Lock mekanizması thread'lerin paralel çalışmasını nasıl kısıtlar?",
    "c_alakasiz": "React'te useState ve useEffect hook'ları arasındaki fark nedir?",
}


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    return dot / (norm_a * norm_b)


async def main():
    client = AsyncOpenAI(
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY or "DUMMY_KEY_IF_EMPTY",
        timeout=30,
        max_retries=0,
    )

    vectors = {}
    for key, text in TEXTS.items():
        response = await client.embeddings.create(
            model=MODEL,
            input=[text],
            extra_body={"input_type": "passage"},
        )
        vectors[key] = response.data[0].embedding
        print(f"{key}: boyut={len(vectors[key])}")

    sim_benzer = cosine(vectors["a_gil"], vectors["b_gil_benzer"])
    sim_alakasiz = cosine(vectors["a_gil"], vectors["c_alakasiz"])

    print(f"\nBenzer (GIL vs GIL) cosine similarity : {sim_benzer:.4f}")
    print(f"Alakasız (GIL vs React) cosine similarity: {sim_alakasiz:.4f}")
    print("\n" + ("BAŞARILI: semantik ayrım anlamlı." if sim_benzer > sim_alakasiz + 0.05 else "ŞÜPHELİ: ayrım net değil."))

    await client.close()


if __name__ == "__main__":
    asyncio.run(main())
