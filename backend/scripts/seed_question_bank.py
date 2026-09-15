"""
`backend/data/question_bank_seed.json` içindeki soruları embed edip Supabase
`question_bank` tablosuna yazar. Bu ÖRNEK/başlangıç içeriğidir, gerçek üretim
verisi değildir — sistemi uçtan uca doğrulamak ve zamanla genişletmek için bir
başlangıç noktasıdır (bkz. proje notları).

ÖN KOŞUL: `backend/sql/001_question_bank.sql` Supabase SQL Editor'ünde daha
önce çalıştırılmış olmalı (question_bank tablosu + pgvector extension mevcut
olmalı) — aksi halde bu script tablo bulunamadı hatasıyla durur.

Çalıştırmak için (backend/ dizininden): `python scripts/seed_question_bank.py`
Gerçek embedding API çağrısı yapar (kota/kredi harcar) ve Supabase'e yazar.
Aynı soruyu tekrar tekrar eklemez diye TASARLANMAMIŞTIR — script'i iki kez
çalıştırırsanız sorular ikinci kez de eklenir; önce mevcut satırları elle
temizlemek isteyebilirsiniz (`delete from question_bank;`).
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.core.database import supabase
from app.services.llm_service import llm_service

SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "question_bank_seed.json"


async def main():
    if not supabase:
        print("HATA: Supabase client başlatılamadı (SUPABASE_URL/SUPABASE_KEY .env'de eksik).")
        return

    questions = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    print(f"{len(questions)} soru bulundu, embedding hesaplanıp yazılacak...\n")

    inserted = 0
    for i, q in enumerate(questions, start=1):
        try:
            embedding = await llm_service.embed_text(q["question_text"], input_type="passage")
            record = {
                "role": q["role"],
                "topic": q["topic"],
                "difficulty": q.get("difficulty"),
                "question_text": q["question_text"],
                "tags": q.get("tags", []),
                "embedding": embedding,
            }
            result = supabase.table("question_bank").insert(record).execute()
            if result.data:
                inserted += 1
                print(f"[{i}/{len(questions)}] OK  {q['role']} / {q['topic']} / {q.get('difficulty')}: {q['question_text'][:60]}...")
            else:
                print(f"[{i}/{len(questions)}] BAŞARISIZ (boş yanıt): {q['question_text'][:60]}...")
        except Exception as e:
            print(f"[{i}/{len(questions)}] BAŞARISIZ: {type(e).__name__}: {str(e)[:200]}")

    print(f"\nTamamlandı: {inserted}/{len(questions)} soru başarıyla eklendi.")
    await llm_service.client.close()


if __name__ == "__main__":
    asyncio.run(main())
