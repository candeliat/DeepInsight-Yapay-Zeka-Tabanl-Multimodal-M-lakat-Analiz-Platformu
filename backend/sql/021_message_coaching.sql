-- Mesaj başına koçluk notu (2026-10-13).
--
-- Davranışsal mülakatta adayın her cevabı için kural tabanlı STAR analizi
-- (bkz. app/services/star_service.py): hangi STAR öğeleri var, ben/biz dili, ölçülebilir
-- sonuç ve en fazla 3 ipucu. Diğer mülakatlarda boş kalır.
alter table public.interview_messages add column if not exists coaching jsonb;
