-- CV yükleme/analiz altyapısı + KVKK açık rıza kaydı.
--
-- CV kişisel veridir: dosya özel (private) bir Storage bucket'ında, metadata
-- ve çıkarılan metin bu tablolarda tutulur. Tüm tablolarda RLS açık ve
-- politika yok -> yalnızca backend (service_role) erişir; sahiplik kontrolü
-- backend'de yapılır (cvs.user_id = oturumdaki kullanıcı).
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor'e yapıştırıp çalıştırın.

create table if not exists user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consent_type text not null,            -- örn. 'cv_processing'
  version text not null,                 -- rıza metninin sürümü
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, consent_type)
);

create table if not exists cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid references organizations(id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes int not null,
  extracted_text text,
  extraction_method text,                -- 'pdf_text' | 'ocr' | 'docx'
  extraction_stats jsonb not null default '{}',  -- sayfa sayısı, sütun tahmini vb. (ATS skoru için)
  profile jsonb,                         -- LLM ile yapılandırılmış profil
  status text not null default 'uploaded'
    check (status in ('uploaded', 'parsed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists cvs_user_idx on cvs (user_id, created_at desc);

create table if not exists cv_analyses (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references cvs(id) on delete cascade,
  user_id uuid not null,
  ats_score int check (ats_score between 0 and 100),
  ats_breakdown jsonb not null default '[]',
  suggestions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists cv_analyses_cv_idx on cv_analyses (cv_id, created_at desc);

alter table user_consents enable row level security;
alter table cvs enable row level security;
alter table cv_analyses enable row level security;
