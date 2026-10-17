-- Geri bildirim: hata bildirimi (bug report) ve özellik önerisi (feature request).
--
-- Kullanıcı web/mobilden gönderir (isteğe bağlı ekran görüntüsü özel `feedback` Storage
-- bucket'ında, backend oluşturur). Platform admini hepsini, gönderenle birlikte görür ve
-- durumunu yönetir. Kullanıcı kendi bildirimlerini ve durumlarını görür. Hesap silinince
-- kullanıcının bildirimleri ve ekran görüntüleri silinir (account_service).
--
-- Yalnızca backend (service_role) yazar/okur: RLS açık, politika yok.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da scripts/run_sql.py.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('bug', 'feature')),
  title text not null,
  description text not null,
  page text,
  platform text check (platform in ('web', 'mobile')),
  user_agent text,
  screenshot_path text,
  status text not null default 'new' check (status in ('new', 'triaged', 'planned', 'resolved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc) where user_id is not null;

alter table public.feedback enable row level security;
