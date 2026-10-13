-- profiles: auth.users'ın okunması kolay aynası (2026-10-13).
--
-- Kurum panelindeki üye listesi her üyenin e-posta/adını ayrı bir Auth admin isteğiyle
-- (get_user_by_id) okuyordu; e-postayla kullanıcı bulmak tüm kullanıcıları sayfa sayfa
-- listelemeyi gerektiriyordu. Bu tablo tetikleyiciyle auth.users'tan senkron tutulur ve
-- ikisini de tek sorguya indirir.
--
-- Kaynak doğruluk auth.users'tadır: profiller yalnızca tetikleyiciyle yazılır. Kullanıcı
-- silinince profil de silinir. RLS açık, politika yok: yalnızca backend (service_role) okur.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  target text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index if not exists idx_profiles_email_lower on public.profiles (lower(email));

create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, target, created_at, updated_at)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'target', ''),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    target = excluded.target,
    updated_at = now();
  return new;
end;
$$;

revoke execute on function public.sync_profile_from_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_sync_profile on auth.users;
create trigger on_auth_user_sync_profile
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Mevcut kullanıcılar
insert into public.profiles (id, email, first_name, last_name, target, created_at, updated_at)
select id, email,
       nullif(raw_user_meta_data ->> 'first_name', ''),
       nullif(raw_user_meta_data ->> 'last_name', ''),
       nullif(raw_user_meta_data ->> 'target', ''),
       created_at, now()
from auth.users
on conflict (id) do nothing;
