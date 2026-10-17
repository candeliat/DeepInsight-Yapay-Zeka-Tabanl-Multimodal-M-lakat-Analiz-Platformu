"""
Soru bankası bilgi tabanını (`backend/data/question_bank/*.json`) Supabase'e yazar.

Önceki `seed_question_bank.py`'den farkı: TEKRAR ÇALIŞTIRILABİLİR (aynı soru metni
varsa yeniden eklenmez, etiket/cevap noktaları güncellenir) ve kürasyon bilgisini
taşır: kanonik beceri etiketleri, soru tipi (teknik/senaryo/davranissal) ve
"iyi bir cevap neleri içermeli" notları (answer_points — adaya gösterilmez,
değerlendirmede referans olarak kullanılır).

Ayrıca:
  - mevcut (eski) soruların etiketlerini kanonik sözlüğe göre düzeltir,
  - RETIRE listesindeki anlamca mükerrer soruları pasifleştirir (silmez).

ÖN KOŞUL: sql/017_question_bank_knowledge.sql uygulanmış olmalı.
Kaynakça ve kürasyon ilkeleri: docs/research/MULAKAT_VE_ATS_ARASTIRMASI.md

Çalıştırmak için (backend/ dizininden):
    python scripts/seed_question_bank_v2.py --dry-run   # yalnızca plan
    python scripts/seed_question_bank_v2.py             # yazar (embedding API'si çağrılır)
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Betikler senkron çalışır: varsayılan istemci asenkron olduğundan .execute() beklenmeyen bir
# coroutine döndürüp işi sessizce yapmıyordu (B geçişinden kalma hata).
from app.core.database import sync_supabase as supabase  # noqa: E402
from app.services.llm_service import llm_service  # noqa: E402
from app.services.question_tags import normalize_tags, tags_from_text  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "question_bank"

# Anlamca aynı soruyu iki kez soran eski satırlar (2026-10-13 incelemesi). Ailesine bağlı
# ve daha önce eklenmiş olan tutulur; diğeri pasifleştirilir.
RETIRE = [
    "Python’da bir fonksiyonun parametreleri için varsayılan (default) değer olarak boş bir liste kullanmak tehlikeli olabilir. Neden bu tehlikeli sayılır ve bu sorunu önlemek için hangi çözüm önerilir?",
    "Python'da GIL (Global Interpreter Lock) nedir ve CPU-bound ile I/O-bound işler için çoklu iş parçacığı (threading) performansını nasıl etkiler?",
]


def load_dataset() -> list[dict]:
    records = []
    for path in sorted(DATA_DIR.glob("*.json")):
        for group in json.loads(path.read_text(encoding="utf-8")):
            tags = normalize_tags(list(group["tags"]) + sorted(tags_from_text(group["topic"])))
            for q in group["questions"]:
                records.append({
                    "role": group["role"],
                    "topic": group["topic"],
                    "difficulty": q["d"],
                    "question_text": q["q"],
                    "tags": tags,
                    "question_type": q.get("type") or group.get("type") or "teknik",
                    "answer_points": q["p"],
                })
    return records


def _embed_local(text: str):
    try:
        from app.services.local_embedding_service import embed_text_local
        return embed_text_local(text, "passage")
    except Exception as e:  # yerel model yoksa API embedding'i yeterli; sonradan backfill edilebilir
        print(f"    (yerel embedding atlandı: {type(e).__name__})")
        return None


async def main(dry_run: bool) -> None:
    if not supabase:
        print("HATA: Supabase client başlatılamadı (SUPABASE_URL/SUPABASE_KEY eksik).")
        sys.exit(1)

    dataset = load_dataset()
    existing = (
        supabase.table("question_bank").select("id, question_text, topic, tags, is_active")
        .is_("org_id", "null").execute().data or []
    )
    by_text = {row["question_text"]: row for row in existing}
    to_insert = [r for r in dataset if r["question_text"] not in by_text]
    to_update = [r for r in dataset if r["question_text"] in by_text]

    retag = []
    for row in existing:
        if row["question_text"] in {r["question_text"] for r in dataset}:
            continue
        new_tags = normalize_tags(list(row.get("tags") or []) + sorted(tags_from_text(row.get("topic"))))
        if new_tags != (row.get("tags") or []):
            retag.append((row, new_tags))
    retire = [by_text[t] for t in RETIRE if t in by_text and by_text[t].get("is_active")]

    print(f"Veri seti: {len(dataset)} soru | eklenecek: {len(to_insert)} | güncellenecek: {len(to_update)} | "
          f"eski satır etiket düzeltmesi: {len(retag)} | emekliye ayrılacak: {len(retire)}")
    for row, tags in retag:
        print(f"  etiket: {row['question_text'][:60]}... {row.get('tags')} -> {tags}")
    if dry_run:
        print("--dry-run: hiçbir şey yazılmadı.")
        return

    for row in retire:
        supabase.table("question_bank").update({"is_active": False}).eq("id", row["id"]).execute()
    for row, tags in retag:
        supabase.table("question_bank").update({"tags": tags}).eq("id", row["id"]).execute()
    for r in to_update:
        fields = {k: r[k] for k in ("role", "topic", "difficulty", "tags", "question_type", "answer_points")}
        supabase.table("question_bank").update(fields).eq("id", by_text[r["question_text"]]["id"]).execute()

    inserted = failed = 0
    for i, r in enumerate(to_insert, start=1):
        try:
            record = dict(r, embedding=await llm_service.embed_text(r["question_text"], input_type="passage"))
            local = _embed_local(r["question_text"])
            if local is not None:
                record["embedding_local"] = local
            supabase.table("question_bank").insert(record).execute()
            inserted += 1
            print(f"[{i}/{len(to_insert)}] OK  {r['topic']} / {r['difficulty']}: {r['question_text'][:55]}...")
        except Exception as e:
            failed += 1
            print(f"[{i}/{len(to_insert)}] BAŞARISIZ: {type(e).__name__}: {str(e)[:160]}")
    print(f"\nTamamlandı: {inserted} eklendi, {failed} başarısız, {len(to_update)} güncellendi, "
          f"{len(retag)} etiket düzeltildi, {len(retire)} emekliye ayrıldı.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    asyncio.run(main(parser.parse_args().dry_run))
