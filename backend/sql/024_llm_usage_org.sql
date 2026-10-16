-- Kurum kullanım/maliyet raporu: LLM kullanım kaydını kuruma ve mülakata bağlar.
--
-- user_id -> memberships ile kuruma atamak yanlış olurdu: bir öğrenci birden çok
-- kurumda olabilir ve bireysel mülakatları kuruma ait değildir. Bu yüzden yalnızca
-- kurum bağlamında (interviews.org_id) yapılan mülakatın çağrıları org_id taşır.
-- Bu kolondan önceki kayıtlar kuruma atanmaz (raporda "kayıt başlangıcı" notu).
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da scripts/run_sql.py.

alter table public.llm_usage
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists interview_id uuid references public.interviews(id) on delete set null;

create index if not exists idx_llm_usage_org_created on public.llm_usage (org_id, created_at desc) where org_id is not null;
