-- Mülakat konuşma dili (2026-10-14).
--
-- "en": sorular İngilizce sorulur (soru bankasındaki Türkçe soru çevrilerek), sesli cevaplar ve
-- video analizi İngilizce çözümlenir, dolgu kelimeleri İngilizce sayılır. Değerlendirme metni
-- Türkçe kalır; kelime puanı İngilizce iletişimi ölçer (bkz. prompts/interview_v1.py).
alter table public.interviews add column if not exists language text not null default 'tr';
alter table public.interviews drop constraint if exists interviews_language_check;
alter table public.interviews add constraint interviews_language_check check (language in ('tr', 'en'));
