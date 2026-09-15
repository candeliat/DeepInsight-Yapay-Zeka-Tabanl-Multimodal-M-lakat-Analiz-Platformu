-- Soru önerisi (candidate) kuyruğu: LLM'in `question_bank_gaps`'teki en çok
-- görülen boşluklar için ürettiği soru önerileri burada birikir. Hiçbir
-- öneri doğrudan `question_bank`'a eklenmez — bir insan (Soru Bankası
-- ekranından) onaylamadan mülakatlarda KULLANILMAZ. Amaç: LLM ölçekte
-- üretsin, insan rubrik/kalite kontrolünü sağlasın (bkz. proje notları —
-- hibrit LLM üretimi + insan onayı büyüme döngüsü).
--
-- NASIL ÇALIŞTIRILIR: `python scripts/run_sql.py sql/004_question_candidates.sql`

create table if not exists question_bank_candidates (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  topic text not null,
  difficulty text,
  question_text text not null,
  source_gap_id uuid references question_bank_gaps(id) on delete set null,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists question_bank_candidates_status_idx
  on question_bank_candidates (status);
