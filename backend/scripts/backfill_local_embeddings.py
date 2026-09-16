"""
`question_bank_admin_service.py`'ye yerel embedding fallback'i (item 4)
eklendiğinde, o tarihten ÖNCE eklenmiş satırların `embedding_local` kolonu
boş kalır (yeni satırlar create_question/update_question ile otomatik
dolduruluyor — bkz. o modüldeki _embed_local_best_effort). Bu script,
`embedding_local is null` olan mevcut satırları TEK SEFERLİK doldurur.

Çalıştırmak için (backend/ dizininden): `python scripts/backfill_local_embeddings.py`
İlk çalıştırmada `sentence-transformers` modelini (newmindai/TurkEmbed4Retrieval,
~305M parametre) Hugging Face'ten indirir — internet bağlantısı ve birkaç
yüz MB disk alanı gerektirir.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.core.database import supabase
from app.services.local_embedding_service import embed_text_local


def main():
    if not supabase:
        print("HATA: Supabase client başlatılamadı (SUPABASE_URL/SUPABASE_KEY .env'de eksik).")
        sys.exit(1)

    result = (
        supabase.table("question_bank")
        .select("id, question_text")
        .is_("embedding_local", "null")
        .execute()
    )
    rows = result.data or []
    print(f"{len(rows)} satırda embedding_local eksik.\n")

    updated = 0
    for i, row in enumerate(rows, start=1):
        try:
            embedding_local = embed_text_local(row["question_text"], "passage")
            supabase.table("question_bank").update({"embedding_local": embedding_local}).eq("id", row["id"]).execute()
            updated += 1
            print(f"[{i}/{len(rows)}] OK  {row['question_text'][:60]}...")
        except Exception as e:
            print(f"[{i}/{len(rows)}] BAŞARISIZ: {type(e).__name__}: {str(e)[:200]}")

    print(f"\nTamamlandı: {updated}/{len(rows)} satır güncellendi.")


if __name__ == "__main__":
    main()
