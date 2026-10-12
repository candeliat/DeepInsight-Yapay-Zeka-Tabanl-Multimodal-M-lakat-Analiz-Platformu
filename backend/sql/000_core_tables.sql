-- Çekirdek mülakat tabloları: interviews, interview_messages, interview_analytics.
--
-- Bu tablolar projenin ilk günlerinde Supabase panelinden elle oluşturuldu ve
-- migration olarak hiç kaydedilmedi; diğer tüm sql/*.sql dosyaları bunların var
-- olduğunu varsayar. Bu dosya CANLI şemanın (2026-10-12, information_schema'dan
-- okundu) birebir kaydıdır; sıfırdan kurulumda ilk çalıştırılacak dosyadır.
-- Var olan veritabanında çalıştırılması zararsızdır (if not exists).
--
-- Sonraki migration'ların eklediği kolonlar (difficulty, question_pool, org_id,
-- cv_id, job_id, assignment_id) ve kısıtları kendi dosyalarındadır (003, 006,
-- 009, 010, 012); burada yalnızca ilk sürümün kolonları vardır.
--
-- Eski kalıntılar (bilinçli olarak dokunulmadı): interviews.user_id uuid değil
-- text'tir ve auth.users'a FK'si yoktur; chat_history, final_score ve
-- evaluation_report kolonları artık kullanılmıyor (mesajlar interview_messages'ta,
-- skorlar *_score kolonlarında). Temizlikleri veri dönüşümü gerektirir.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor, Supabase MCP apply_migration ya da
--   python scripts/run_sql.py sql/000_core_tables.sql

create extension if not exists "uuid-ossp";

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'anonymous',
  chat_history jsonb not null,
  final_score integer check (final_score >= 0 and final_score <= 100),
  evaluation_report text,
  created_at timestamptz not null default now(),
  role text,
  topic text,
  status text default 'ongoing',
  technical_score integer default 0,
  confidence_score integer default 0,
  vocabulary_score integer default 0,
  feedback text
);

create index if not exists idx_interviews_user_id on public.interviews (user_id);
create index if not exists idx_interviews_created_at on public.interviews (created_at desc);

create table if not exists public.interview_messages (
  id uuid primary key default uuid_generate_v4(),
  interview_id uuid references public.interviews (id),
  role text,
  content text,
  created_at timestamptz default now()
);

create table if not exists public.interview_analytics (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews (id) on delete cascade,
  confidence_pct double precision default 0,
  eye_contact_pct double precision default 0,
  pause_count integer default 0,
  filler_word_count integer default 0,
  filler_words_detail jsonb default '{}'::jsonb,
  speech_rate_wpm double precision default 0,
  dominant_emotion text default 'neutral',
  emotion_distribution jsonb default '{}'::jsonb,
  transcript text default '',
  analysis_status text default 'pending',
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tüm erişim service_role kullanan backend üzerinden (bkz. 014_security_hardening.sql).
alter table public.interviews enable row level security;
alter table public.interview_messages enable row level security;
alter table public.interview_analytics enable row level security;
