-- Soru bankası bilgi tabanı (2026-10-13).
--
-- 1) answer_points: "iyi bir cevap neleri içermeli" notları (jsonb dizi). Adaya
--    GÖSTERİLMEZ; mülakat sonu değerlendirmesinde LLM'e referans olarak verilir ki
--    puanlama soru bazında tutarlı olsun (bkz. llm_service.get_final_evaluation).
-- 2) question_type: 'teknik' | 'senaryo' | 'davranissal' — davranışsal (STAR)
--    sorular teknik mülakat havuzuna karışmasın diye ayrıştırılır.
-- 3) tags üzerinde GIN indeksi: soru seçimi artık önce etiket örtüşmesiyle
--    (tags && ARRAY[...]) yapılır, embedding yalnızca yedektir
--    (bkz. app/services/question_tags.py, question_bank_service.fetch_question_pool).
-- 4) Aynı soru metninin (aynı kapsamda) iki kez eklenmesini engelleyen benzersiz
--    indeks — tohumlama betiği tekrar çalıştırılabilir (upsert) hale gelir.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor, Supabase MCP apply_migration ya da
--   python scripts/run_sql.py sql/017_question_bank_knowledge.sql

alter table public.question_bank
  add column if not exists answer_points jsonb not null default '[]'::jsonb,
  add column if not exists question_type text not null default 'teknik';

alter table public.question_bank
  drop constraint if exists question_bank_question_type_check;
alter table public.question_bank
  add constraint question_bank_question_type_check
  check (question_type in ('teknik', 'senaryo', 'davranissal'));

create index if not exists question_bank_tags_idx on public.question_bank using gin (tags);

-- Önce bilinen mükerrerler pasifleştirilir (canlıda 2 çift vardı), sonra benzersiz indeks.
update public.question_bank q set is_active = false
where exists (
  select 1 from public.question_bank o
  where o.id <> q.id
    and o.org_id is not distinct from q.org_id
    and lower(regexp_replace(o.question_text, '[’'']', '', 'g')) = lower(regexp_replace(q.question_text, '[’'']', '', 'g'))
    and (o.created_at, o.id) < (q.created_at, q.id)
);

create unique index if not exists question_bank_text_scope_uniq
  on public.question_bank (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), md5(question_text))
  where is_active;
