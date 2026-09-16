-- Yerel (lokal) embedding fallback: NVIDIA API embedding servisi kota/ağ
-- hatasıyla çöktüğünde soru bankası retrieval'inin tamamen devre dışı
-- kalmaması için ikinci, tamamen ayrı bir embedding sütunu + RPC'si.
--
-- ÖNEMLİ: Bu, birincil `embedding` kolonunun basit bir yedeği DEĞİLDİR —
-- farklı bir model (yerel `newmindai/TurkEmbed4Retrieval`, 768 boyut)
-- farklı bir vektör uzayı üretir; iki modelin vektörleri birbirleriyle
-- cosine similarity ile KIYASLANAMAZ. Bu yüzden ayrı kolon + ayrı RPC
-- gerekiyor (bkz. app/services/local_embedding_service.py).
--
-- NASIL ÇALIŞTIRILIR: önceki migration'lar gibi Supabase SQL Editor'de ya
-- da `python scripts/run_sql.py sql/005_local_embedding_fallback.sql`.

alter table question_bank
  add column if not exists embedding_local vector(768);

-- Yerel modelle arama yapan RPC — match_questions ile AYNI satır şeklini
-- döner ki question_bank_service.py'deki ranking/family-packing mantığı
-- hiç değişmeden her iki RPC ile de çalışabilsin.
create or replace function match_questions_local(
  query_embedding vector(768),
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
    1 - (qb.embedding_local <=> query_embedding) as similarity
  from question_bank qb
  where qb.is_active
    and qb.embedding_local is not null
    and (filter_difficulty is null or qb.difficulty = filter_difficulty)
  order by qb.embedding_local <=> query_embedding
  limit match_count;
$$;
