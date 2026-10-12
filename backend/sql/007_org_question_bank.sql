-- Kuruma özel soru bankası: org_id null = platform geneli (global) soru,
-- dolu = yalnızca o kurumun soruları. Arama hem global hem (verilirse) kurum
-- sorularını kapsar; başka bir kurumun soruları ASLA dönmez.
--
-- Fonksiyon imzası değiştiği için (filter_org_id eklendi) önce DROP gerekiyor
-- (bkz. 002 notu). Aynı anda search_path sabitlenerek Supabase güvenlik
-- uyarısı (function_search_path_mutable) giderilir.
--
-- NASIL ÇALIŞTIRILIR: Supabase MCP apply_migration ya da run_sql.py.

alter table question_bank
  add column if not exists org_id uuid references organizations(id) on delete cascade;

create index if not exists question_bank_org_idx
  on question_bank (org_id) where org_id is not null;

drop function if exists match_questions(vector, text, integer);

create or replace function match_questions(
  query_embedding vector(2048),
  filter_difficulty text default null,
  match_count int default 5,
  filter_org_id uuid default null
)
returns table (
  id uuid,
  question_text text,
  role text,
  topic text,
  difficulty text,
  times_served int,
  family_id uuid,
  similarity float
)
language sql stable
set search_path = public
as $$
  select
    qb.id,
    qb.question_text,
    qb.role,
    qb.topic,
    qb.difficulty,
    qb.times_served,
    qb.family_id,
    1 - (qb.embedding <=> query_embedding) as similarity
  from question_bank qb
  where qb.is_active
    and (qb.org_id is null or qb.org_id = filter_org_id)
    and (filter_difficulty is null or qb.difficulty = filter_difficulty)
  order by qb.embedding <=> query_embedding
  limit match_count;
$$;

drop function if exists match_questions_local(vector, text, integer);

create or replace function match_questions_local(
  query_embedding vector(768),
  filter_difficulty text default null,
  match_count int default 5,
  filter_org_id uuid default null
)
returns table (
  id uuid,
  question_text text,
  role text,
  topic text,
  difficulty text,
  times_served int,
  family_id uuid,
  similarity float
)
language sql stable
set search_path = public
as $$
  select
    qb.id,
    qb.question_text,
    qb.role,
    qb.topic,
    qb.difficulty,
    qb.times_served,
    qb.family_id,
    1 - (qb.embedding_local <=> query_embedding) as similarity
  from question_bank qb
  where qb.is_active
    and qb.embedding_local is not null
    and (qb.org_id is null or qb.org_id = filter_org_id)
    and (filter_difficulty is null or qb.difficulty = filter_difficulty)
  order by qb.embedding_local <=> query_embedding
  limit match_count;
$$;

alter function increment_times_served(uuid[]) set search_path = public;
