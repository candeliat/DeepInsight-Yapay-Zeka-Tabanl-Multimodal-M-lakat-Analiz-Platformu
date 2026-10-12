-- Mülakatı, kişiselleştirmede kullanılan CV'ye bağlar.
--
-- on delete set null: kullanıcı CV'sini sildiğinde (ya da KVKK rızasını geri
-- çektiğinde) mülakat kaydı kalır ama CV ile bağı kopar; sonraki turlarda
-- artık CV'den türetilmiş bağlam kullanılmaz.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor'e yapıştırıp çalıştırın.

alter table interviews
  add column if not exists cv_id uuid references cvs(id) on delete set null;

create index if not exists interviews_cv_idx on interviews (cv_id) where cv_id is not null;
