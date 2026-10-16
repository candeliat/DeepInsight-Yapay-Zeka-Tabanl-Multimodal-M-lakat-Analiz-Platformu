-- Ödev hatırlatma: uygulama içi bildirimler.
--
-- Bildirimler dört türdür: yeni ödev (ödev oluşturulunca), son tarihe 24 saatten
-- az kaldı ve süresi geçti (kullanıcı bildirimlerini açtığında üretilir, zamanlayıcı
-- gerekmez), eğitmen hatırlatması (eğitmen "Hatırlat" deyince, ödev başına 12 saatte
-- bir). dedupe_key aynı bildirimin iki kez üretilmesini engeller.
--
-- Backend service_role ile yazar/okur ve her sorguda user_id filtreler; RLS açık,
-- istemciye doğrudan politika verilmez (diğer tablolardaki desen).
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da scripts/run_sql.py.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  assignment_id uuid references assignments(id) on delete cascade,
  kind text not null check (kind in ('assignment_new', 'assignment_due_soon', 'assignment_overdue', 'assignment_reminder')),
  title text not null,
  body text,
  link text,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_assignment_idx on notifications (assignment_id) where assignment_id is not null;

alter table notifications enable row level security;

alter table assignments add column if not exists last_reminded_at timestamptz;
