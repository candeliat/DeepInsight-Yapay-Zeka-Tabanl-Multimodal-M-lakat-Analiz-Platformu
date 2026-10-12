-- Faz 2: iş ilanı eşleştirme.
--
-- job_postings: kullanıcının yapıştırdığı ilan metni + LLM ile çıkarılan
-- gereksinimler. job_matches: bir ilanla bir CV'nin (deterministik) eşleşme
-- sonucu ve öğrenme yol haritası. interviews.job_id: "bu ilana göre mülakat".
--
-- Tüm tablolarda RLS açık, politika yok -> yalnızca backend (service_role)
-- erişir; sahiplik kontrolü backend'de (user_id = oturumdaki kullanıcı).
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da Supabase MCP apply_migration.

create table if not exists job_postings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid references organizations(id) on delete set null,
  title text,
  company text,
  raw_text text not null,
  requirements jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists job_postings_user_idx on job_postings (user_id, created_at desc);

create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null references job_postings(id) on delete cascade,
  cv_id uuid not null references cvs(id) on delete cascade,
  match_score int not null check (match_score between 0 and 100),
  breakdown jsonb not null default '{}',
  roadmap jsonb not null default '[]',
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists job_matches_job_cv_idx on job_matches (job_id, cv_id, created_at desc);

alter table job_postings enable row level security;
alter table job_matches enable row level security;

alter table interviews
  add column if not exists job_id uuid references job_postings(id) on delete set null;

create index if not exists interviews_job_idx on interviews (job_id) where job_id is not null;
