-- Soru bankası: exposure control (aynı sorunun aşırı tekrarını önleme) ve
-- kullanım boşluğu (gap) takibi.
--
-- NASIL ÇALIŞTIRILIR: 001_question_bank.sql gibi, Supabase SQL Editor'de
-- çalıştırın (supabase-py DDL çalıştıramıyor).

-- 1) Exposure control: her sorunun kaç kez bir mülakat havuzuna seçildiğini
--    say. `question_bank_service.fetch_question_pool` bunu, benzerlik
--    sıralamasına hafif bir ceza olarak uygulayıp aynı popüler sorunun her
--    seferinde seçilmesini engellemek için kullanır (bkz. CAT sistemlerindeki
--    "item exposure control" prensibi — proje notlarına bakın).
alter table question_bank
  add column if not exists times_served int not null default 0;

-- match_questions RPC'sinin times_served'i de döndürmesi gerekiyor —
-- fonksiyonu bu ek kolonla yeniden tanımlıyoruz (create or replace güvenli).
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
  times_served int,
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
    qb.times_served,
    1 - (qb.embedding <=> query_embedding) as similarity
  from question_bank qb
  where qb.is_active
    and (filter_difficulty is null or qb.difficulty = filter_difficulty)
  order by qb.embedding <=> query_embedding
  limit match_count;
$$;

-- Havuza seçilen soruların times_served'ini TEK bir atomik UPDATE ile
-- artırır (read-then-write yarışından kaçınmak için) — bkz.
-- question_bank_service._increment_times_served.
create or replace function increment_times_served(question_ids uuid[])
returns void
language sql
as $$
  update question_bank
  set times_served = times_served + 1
  where id = any(question_ids);
$$;

-- 2) Kullanım boşluğu (gap) takibi: banka hangi role+topic+difficulty
--    kombinasyonu için yeterli/hiç eşleşme döndüremediyse burada birikir.
--    Amaç, hangi içeriğin gerçekten eksik olduğunu TAHMİN etmek yerine
--    gerçek kullanım verisine dayanarak öncelik sırası çıkarabilmek (bkz.
--    proje yol haritası — ileride bu tablo LLM ile toplu soru üretimi +
--    insan onayı akışını besleyecek).
create table if not exists question_bank_gaps (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  topic text not null,
  difficulty text,
  miss_count int not null default 1,
  last_missing_count int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (role, topic, difficulty)
);
