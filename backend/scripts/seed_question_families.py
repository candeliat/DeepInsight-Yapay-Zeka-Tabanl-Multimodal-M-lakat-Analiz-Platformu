"""
`backend/data/question_bank_families_seed.json` içindeki soru AİLELERİNİ
(her biri aynı konuyu farklı zorluklarda ele alan varyant grupları) embed
edip Supabase `question_bank` tablosuna, ortak bir `family_id` ile yazar.

Bu ÖRNEK/başlangıç içeriğidir — sistemi uçtan uca doğrulamak için 2 aile
(6 soru). Zamanla daha fazla aile eklenebilir (bkz. seed_question_bank.py
ile aynı desen, ama her satıra `family_id` de ekleniyor).

ÖN KOŞUL: `backend/sql/003_question_families.sql` Supabase SQL Editor'ünde
daha önce çalıştırılmış olmalı (question_bank.family_id kolonu mevcut olmalı).

Çalıştırmak için (backend/ dizininden): `python scripts/seed_question_families.py`
Gerçek embedding API çağrısı yapar (kota/kredi harcar) ve Supabase'e yazar.
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.core.database import supabase
from app.services.llm_service import llm_service

SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "question_bank_families_seed.json"


async def main():
    if not supabase:
        print("HATA: Supabase client başlatılamadı (SUPABASE_URL/SUPABASE_KEY .env'de eksik).")
        return

    families = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    total_variants = sum(len(f["variants"]) for f in families)
    print(f"{len(families)} aile, toplam {total_variants} varyant bulundu.\n")

    inserted = 0
    i = 0
    for family in families:
        family_id = str(uuid.uuid4())
        print(f"=== Aile: {family['family']} (family_id={family_id}) ===")
        for variant in family["variants"]:
            i += 1
            try:
                embedding = await llm_service.embed_text(variant["question_text"], input_type="passage")
                record = {
                    "role": family["role"],
                    "topic": family["topic"],
                    "difficulty": variant["difficulty"],
                    "question_text": variant["question_text"],
                    "tags": family.get("tags", []),
                    "family_id": family_id,
                    "embedding": embedding,
                }
                result = supabase.table("question_bank").insert(record).execute()
                if result.data:
                    inserted += 1
                    print(f"  [{i}/{total_variants}] OK  {variant['difficulty']}: {variant['question_text'][:60]}...")
                else:
                    print(f"  [{i}/{total_variants}] BAŞARISIZ (boş yanıt): {variant['question_text'][:60]}...")
            except Exception as e:
                print(f"  [{i}/{total_variants}] BAŞARISIZ: {type(e).__name__}: {str(e)[:200]}")
        print()

    print(f"Tamamlandı: {inserted}/{total_variants} varyant başarıyla eklendi.")
    await llm_service.client.close()


if __name__ == "__main__":
    asyncio.run(main())
