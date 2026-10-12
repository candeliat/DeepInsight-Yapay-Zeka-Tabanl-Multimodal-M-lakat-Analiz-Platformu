-- Güvenlik sıkılaştırma (Faz 5 öncesi tarama).
--
-- 1) interviews tablosundaki "Allow all for now" politikası anon dahil herkese
--    tüm mülakatları okuma/yazma/silme izni veriyordu (Supabase REST + anon key).
--    İstemciler (dashboard, mobil) veritabanına doğrudan erişmez; tüm erişim
--    service_role kullanan backend üzerinden ve backend'deki yetki kontrolüyle
--    olur. Politika kaldırılınca RLS açık + politika yok = yalnızca service_role.
-- 2) rls_auto_enable event-trigger fonksiyonu anon/authenticated tarafından
--    RPC ile çağrılabilir görünüyordu; EXECUTE yetkisi geri alınır.
--
-- NASIL ÇALIŞTIRILIR: Supabase SQL Editor ya da Supabase MCP apply_migration.

drop policy if exists "Allow all for now" on public.interviews;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
