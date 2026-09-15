-- Soru aileleri: aynı temel konuyu farklı zorluk seviyelerinde ele alan
-- soru varyantları. Amaç, gerçek mülakatlarda görülen "tek bir konuyu
-- derinleştirme" desenini yakalamak — her turda alakasız yeni bir konuya
-- atlamak yerine, aday iyi gidiyorsa AYNI ailenin bir zor varyantına
-- geçilir (bkz. proje notları: Holloway teknik mülakat rehberi).
--
-- Bu bir GERÇEK ZAMANLI adaptif dallanma DEĞİL — /start'ta havuz tek
-- seferde çekilirken, bir aileden gelen en iyi eşleşme bulunduğunda o
-- ailenin eşleşen zorluktan başlayıp daha zoruna doğru giden TÜM
-- varyantları ardışık havuz slotlarına statik olarak paketlenir (bkz.
-- question_bank_service.py:_fetch_family_chain). Böylece ek bir LLM
-- çağrısı ya da her turda "cevap iyi miydi" değerlendirmesi gerekmez —
-- mevcut sıralı havuz tüketim mimarisi (questions_asked index'i)
-- hiç değişmeden çalışmaya devam eder.
--
-- NASIL ÇALIŞTIRILIR: önceki migration'lar gibi Supabase SQL Editor'de.

alter table question_bank
  add column if not exists family_id uuid;

create index if not exists question_bank_family_idx
  on question_bank (family_id) where family_id is not null;

-- match_questions RPC'sinin family_id'yi de döndürmesi gerekiyor.
-- (Dönüş tipi değiştiği için yine önce DROP gerekiyor — bkz. 002 notu.)
drop function if exists match_questions(vector, text, integer);

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
  family_id uuid,
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
    qb.family_id,
    1 - (qb.embedding <=> query_embedding) as similarity
  from question_bank qb
  where qb.is_active
    and (filter_difficulty is null or qb.difficulty = filter_difficulty)
  order by qb.embedding <=> query_embedding
  limit match_count;
$$;
