"""
llm_service'i GERÇEK LLM API'sine (bkz. .env: LLM_BASE_URL/LLM_API_KEY) karşı
çalıştırıp soru üretme + nihai değerlendirme akışını manuel doğrulamak için.
Supabase gerektirmez. Gerçek API çağrısı yapar (kota/kredi harcar) — pytest'e
dahil değildir, elle çalıştırılır: `python check_llm_live.py`

Not: Script sonunda bazı ortamlarda (Windows + Python 3.13 + httpx/httpcore)
zararsız bir "asynchronous generator ... GeneratorExit" uyarısı görülebilir —
bu, kısa ömürlü script'in event loop kapanışıyla ilgili kozmetik bir durumdur;
gerçek sonuçları (SORU/DEĞERLENDİRME/STREAM çıktıları) etkilemez. Gerçek
sunucuda llm_service process boyunca yaşadığı için bu durum oluşmaz.
"""
import asyncio
import sys
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.services.llm_service import llm_service


async def main():
    print("=== 1) get_next_question (ilk soru) ===")
    q1 = await llm_service.get_next_question(
        message="Mülakatı başlat.",
        history=[],
        role="Backend Developer",
        topic="Python",
        question_number=1,
        max_questions=5,
    )
    print("SORU 1:", q1)

    print("\n=== 2) get_next_question (aday cevabı sonrası) ===")
    history = [
        {"role": "user", "content": "Mülakatı başlat."},
        {"role": "model", "content": q1},
    ]
    q2 = await llm_service.get_next_question(
        message="Python'da GIL nedir, kısaca RAM yönetimini nasıl etkiler onu anlattım.",
        history=history,
        role="Backend Developer",
        topic="Python",
        question_number=2,
        max_questions=5,
    )
    print("SORU 2:", q2)

    print("\n=== 3) get_final_evaluation (JSON modu) ===")
    eval_history = history + [
        {"role": "user", "content": "GIL, aynı anda sadece bir thread'in Python bytecode çalıştırmasına izin veren bir kilit mekanizmasıdır."},
        {"role": "model", "content": q2},
        {"role": "user", "content": "Decorator'lar fonksiyonları sarmalayıp davranışlarını değiştiren fonksiyonlardır, örneğin @staticmethod."},
    ]
    evaluation = await llm_service.get_final_evaluation(
        history=eval_history,
        role="Backend Developer",
        topic="Python",
    )
    print("DEĞERLENDİRME:", evaluation)

    print("\n=== 4) stream_next_question (token-token akış) ===")
    print("STREAM: ", end="", flush=True)
    async for delta in llm_service.stream_next_question(
        message="Peki context manager'lar (with ifadesi) hakkında ne biliyorsunuz?",
        history=eval_history,
        role="Backend Developer",
        topic="Python",
        question_number=4,
        max_questions=5,
    ):
        print(delta, end="", flush=True)
    print()

    print("\n=== 5) Kullanım istatistikleri ===")
    for model, stats in llm_service.get_usage_stats().items():
        print(f"  {model}: {stats}")

    # Script tek seferlik kısa ömürlü olduğu için client'ı burada kapatıyoruz.
    # Gerçek sunucuda llm_service process boyunca yaşayan bir singleton
    # olduğundan bu adıma gerek yoktur (bağlantı havuzu isteklerde paylaşılır).
    await llm_service.client.close()


if __name__ == "__main__":
    asyncio.run(main())
