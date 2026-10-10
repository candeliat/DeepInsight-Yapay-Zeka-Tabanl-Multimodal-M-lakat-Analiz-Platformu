-- Faz 4B: ödev atama. Eğitmen kurum öğrencilerine belirli rol/konu/zorlukta
-- bir mülakat ödevi verir; ödevden başlatılan mülakat interviews.assignment_id
-- ile ödeve bağlanır ve tamamlanma durumu buradan izlenir.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da Supabase MCP apply_migration.

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null,
  title text not null,
  role text not null,
  topic text not null,
  difficulty text check (difficulty in ('JUNIOR', 'ORTA', 'UZMAN')),
  instructions text,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists assignments_org_idx on assignments (org_id, created_at desc);

alter table assignments enable row level security;

alter table interviews
  add column if not exists assignment_id uuid references assignments(id) on delete set null;

create index if not exists interviews_assignment_idx on interviews (assignment_id) where assignment_id is not null;
