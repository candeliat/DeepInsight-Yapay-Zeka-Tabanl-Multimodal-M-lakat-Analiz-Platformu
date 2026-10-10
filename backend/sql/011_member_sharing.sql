-- Faz 4A: öğrencinin kendi ilerlemesini kurumla paylaşma rızası.
--
-- Varsayılan FALSE: kuruma katılmak, eğitmenin öğrencinin skorlarını tek tek
-- görmesine izin vermek anlamına gelmez. Paylaşmayan öğrenciler yalnızca
-- (yeterince büyük gruplarda) toplu istatistiklere katkı verir.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da Supabase MCP apply_migration.

alter table memberships
  add column if not exists share_progress boolean not null default false;
