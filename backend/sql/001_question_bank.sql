-- Soru bankası + RAG retrieval altyapısı.
--
-- NASIL ÇALIŞTIRILIR: Supabase projesinin SQL Editor'ünde (Dashboard >
-- SQL Editor > New query) bu dosyanın tamamını yapıştırıp çalıştırın.
-- supabase-py (REST/PostgREST) client'ı DDL çalıştıramadığı için bu adım
-- elle yapılmalıdır — bkz. backend/app/core/database.py (yalnızca
-- table()/rpc() destekler, raw SQL değil).
--
-- Embedding boyutu (2048) `nvidia/nemotron-3-embed-1b` modeline göre
-- sabitlenmiştir (bkz. backend/check_embedding_live.py ile canlı doğrulama).
-- Bu model değişirse bu dosyadaki `vector(2048)` boyutları da güncellenmelidir.

create extension if not exists vector;

-- 1) Soru bankası
create table if not exists question_bank (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  topic text not null,
  difficulty text,                          -- 'JUNIOR' | 'ORTA' | 'UZMAN' | null (seviye belirtilmemiş sorular)
  question_text text not null,
  tags text[] not null default '{}',
  embedding vector(2048) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- NOT: `nvidia/nemotron-3-embed-1b` 2048 boyutlu vektör üretiyor — pgvector'da
-- hem ivfflat hem hnsw ANN index'leri 2000 boyutla SINIRLI (bkz. "column
-- cannot have more than 2000 dimensions for ivfflat/hnsw index" hatası), bu
-- yüzden embedding kolonuna kasıtlı olarak bir ANN index EKLENMİYOR —
-- match_questions RPC'si düz (sequential) taramayla cosine distance
-- hesaplıyor. Soru bankası boyutu (onlarca/yüzlerce kürasyonlu satır) için bu
-- yeterince hızlı; tablo binlerce satıra ulaşırsa embedding'i 2000 boyutun
-- altına indiren bir modele geçiş (ya da MRL truncation) değerlendirilebilir.

create index if not exists question_bank_active_idx
  on question_bank (is_active) where is_active;

-- 2) Cosine-similarity retrieval RPC'si.
--    Role/topic serbest metin olduğu için (kullanıcı "Backend Developer" ya da
--    "backend geliştirici" yazabilir) burada TAM EŞLEŞME aranmaz — role+topic
--    zaten sorgu embedding'inin İÇİNE gömülüdür (bkz. question_bank_service.py),
--    yalnızca `difficulty` (küçük, sabit bir enum) için kesin filtre uygulanır.
create or replace function match_questions(
  query_embedding vector(2048),
  filter_difficulty text default null,
  match_count int default 5
)
returns table (
  id uuid,
  question_text text,
  role text,
  topic text,
  difficulty text,
  similarity float
)
language sql stable
as $$
  select
    qb.id,
    qb.question_text,
    qb.role,
    qb.topic,
    qb.difficulty,
    1 - (qb.embedding <=> query_embedding) as similarity
  from question_bank qb
  where qb.is_active
    and (filter_difficulty is null or qb.difficulty = filter_difficulty)
  order by qb.embedding <=> query_embedding
  limit match_count;
$$;

-- 3) `interviews` tablosuna: seçilen zorluk seviyesi (gerçek alan olarak —
--    önceden dashboard bunu topic string'ine gizliyordu) ve mülakat
--    başlangıcında TEK SEFERDE önceden çekilmiş soru havuzu.
--    question_pool sırayla tüketilir: interview.py'deki mevcut
--    `questions_asked` sayacı zaten 0-indexed "bir sonraki soru index'i"
--    görevi görür, ayrı bir "sorulmuş id'ler" kolonuna gerek yoktur.
alter table interviews
  add column if not exists difficulty text,
  add column if not exists question_pool jsonb not null default '[]';
