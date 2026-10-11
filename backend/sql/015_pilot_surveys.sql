-- Faz 5: pilot çalışma anketleri.
--
-- Araştırma onamı mevcut user_consents tablosunda consent_type='research_pilot'
-- olarak tutulur. Anket yanıtları yalnızca onam veren katılımcılardan alınır;
-- onam geri çekilirse yanıtlar silinir ve kişi pilot raporundan çıkar.
--
-- kind:
--   post_interview: mülakat sonrası kısa anket (mülakat başına bir yanıt)
--   sus:            System Usability Scale (kullanıcı başına bir yanıt, güncellenebilir)
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da Supabase MCP apply_migration.

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('post_interview', 'sus')),
  interview_id uuid references interviews(id) on delete cascade,
  answers jsonb not null,
  score numeric,
  comment text,
  created_at timestamptz not null default now(),
  check ((kind = 'post_interview') = (interview_id is not null))
);

create unique index if not exists survey_post_interview_uniq
  on survey_responses (user_id, interview_id) where kind = 'post_interview';
create unique index if not exists survey_sus_uniq
  on survey_responses (user_id) where kind = 'sus';

alter table survey_responses enable row level security;
