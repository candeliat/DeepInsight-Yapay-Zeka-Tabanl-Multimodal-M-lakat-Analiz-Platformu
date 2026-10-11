-- Faz 4C: gruplar (kohort), toplu davet ve kurum değerlendirme rubriği.
--
-- - org_groups: kurum içi sınıf/kohort. Her üye en fazla bir gruptadır
--   (memberships.group_id). Ödev bir gruba hedeflenebilir (assignments.group_id).
-- - org_invites: e-postayla bekleyen davetler. Kullanıcı kuruma ancak daveti
--   KENDİSİ kabul edince eklenir (rızasız üyelik yok).
-- - organizations.rubric: kurum skorlarında teknik/özgüven/iletişim ağırlıkları
--   (toplam 100). null = eşit ağırlık.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da Supabase MCP apply_migration.

create table if not exists org_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table org_groups enable row level security;

alter table memberships
  add column if not exists group_id uuid references org_groups(id) on delete set null;

alter table assignments
  add column if not exists group_id uuid references org_groups(id) on delete set null;

create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'candidate' check (role in ('instructor', 'candidate')),
  group_id uuid references org_groups(id) on delete set null,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create index if not exists org_invites_email_idx on org_invites (email);

alter table org_invites enable row level security;

alter table organizations
  add column if not exists rubric jsonb;
