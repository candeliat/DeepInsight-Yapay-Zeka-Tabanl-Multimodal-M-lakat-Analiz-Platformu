-- Multi-tenant temel: kurumlar, üyelikler, denetim kaydı.
--
-- Bir kullanıcı birden çok kurumda olabilir, bu yüzden kurum rolü JWT'ye
-- (app_metadata) değil `memberships` tablosuna bağlanır. Platform admini
-- (app_metadata.role = 'admin') ayrıdır ve kurumları o oluşturur.
--
-- Bu tablolara yalnızca backend (service_role) erişir: RLS açık ve hiçbir
-- politika tanımlı değil, yani anon/authenticated istemciler doğrudan
-- okuyup yazamaz. Tenant ayrımı backend'de `require_org_role` ile zorlanır.
--
-- NASIL ÇALIŞTIRILIR: python scripts/run_sql.py sql/006_organizations.sql

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  settings jsonb not null default '{}',
  monthly_interview_quota int,               -- null = sınırsız
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('org_admin', 'instructor', 'candidate')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_idx on memberships (user_id);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  org_id uuid references organizations(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_idx on audit_log (org_id, created_at desc);

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table audit_log enable row level security;

-- Bir mülakat bir kuruma ait olabilir (null = bireysel/kurumsuz kullanım).
alter table interviews
  add column if not exists org_id uuid references organizations(id) on delete set null;

create index if not exists interviews_org_idx on interviews (org_id) where org_id is not null;
