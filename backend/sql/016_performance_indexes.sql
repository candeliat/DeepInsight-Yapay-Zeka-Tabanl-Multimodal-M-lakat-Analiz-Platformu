-- Performans: eksik indeksler (mimari tarama, 2026-10-12).
--
-- Canlı istatistik (pg_stat_user_tables): interview_messages 126 sıralı tarama /
-- 0 indeks kullanımı, interview_analytics 231 / 0. Sohbetin her turu mülakatın
-- mesaj geçmişini okur; indeks olmadan her okuma tüm tabloyu tarar ve tablo
-- büyüdükçe her tur yavaşlar. Supabase performans denetimi ayrıca 10 indekssiz
-- yabancı anahtar bildirdi (FK'li satır silinirken/join'de tam tarama).
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor, Supabase MCP apply_migration ya da
--   python scripts/run_sql.py sql/016_performance_indexes.sql

-- Mülakat geçmişi: where interview_id = ? order by created_at
create index if not exists interview_messages_interview_idx
  on public.interview_messages (interview_id, created_at);

-- Mülakat başına tek analiz satırı. Kod önce okuyup sonra ekliyordu; eşzamanlı iki
-- yazımda çift satır oluşabiliyordu. Benzersiz kısıt hem bunu engeller hem de
-- upsert(on_conflict='interview_id') için gereken indeksi sağlar.
-- (Uygulanmadan önce kontrol edildi: çift satır yok.)
alter table public.interview_analytics
  drop constraint if exists interview_analytics_interview_id_key;
alter table public.interview_analytics
  add constraint interview_analytics_interview_id_key unique (interview_id);

-- Indekssiz yabancı anahtarlar (Supabase linter: unindexed_foreign_keys).
create index if not exists assignments_group_idx on public.assignments (group_id);
create index if not exists cvs_org_idx on public.cvs (org_id);
create index if not exists job_matches_cv_idx on public.job_matches (cv_id);
create index if not exists job_postings_org_idx on public.job_postings (org_id);
create index if not exists memberships_group_idx on public.memberships (group_id);
create index if not exists org_invites_group_idx on public.org_invites (group_id);
create index if not exists question_bank_candidates_gap_idx on public.question_bank_candidates (source_gap_id);
create index if not exists survey_responses_interview_idx on public.survey_responses (interview_id);

-- interview_analytics'teki son RLS politikası: istemciler veritabanına doğrudan
-- erişmez (bkz. 014), politika kullanılmıyor ve her satırda auth.uid() yeniden
-- değerlendirildiği için linter uyarısı veriyordu. Kaldırılınca bu tablo da diğerleri
-- gibi "RLS açık, politika yok = yalnızca backend".
drop policy if exists "Users can view their own analytics" on public.interview_analytics;
