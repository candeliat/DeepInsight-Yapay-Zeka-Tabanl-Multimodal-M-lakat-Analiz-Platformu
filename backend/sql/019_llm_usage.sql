-- LLM kullanım kaydı (2026-10-13).
--
-- Her model denemesi (başarılı ya da değil) bir satır: amaç, model, gecikme, token.
-- Kullanım: kurum maliyet raporu (user_id -> memberships), model sağlık analizi
-- (hangi model ne sıklıkla zaman aşımına düşüyor), kullanıcı başına kota.
-- Yalnızca backend (service_role) yazar/okur: RLS açık, politika yok.
-- Kullanıcı silinince satırlar kimliksizleşir (user_id null), maliyet toplamı korunur.

create table if not exists public.llm_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  purpose text not null,
  model text not null,
  success boolean not null,
  error_type text,
  latency_ms integer not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  prompt_version text
);

alter table public.llm_usage enable row level security;

create index if not exists idx_llm_usage_created_at on public.llm_usage (created_at desc);
create index if not exists idx_llm_usage_user_created on public.llm_usage (user_id, created_at desc) where user_id is not null;
