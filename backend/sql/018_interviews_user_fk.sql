-- interviews.user_id: text → uuid + auth.users yabancı anahtarı (2026-10-13).
--
-- Kimlik doğrulaması zorunlu hale gelmeden önce (Nisan–Haziran 2026) oluşan, gerçek
-- bir kullanıcıya bağlı olmayan test satırları ('anonymous', 'test-user',
-- 'mobile-user', 00000000-... ve silinmiş kullanıcılar) dönüşümü engelliyordu;
-- bunlar mesaj/analiz kayıtlarıyla birlikte silinir.
-- Hesap silindiğinde mülakatlar ve mesajları veritabanında da zincirleme silinir
-- (account_service zaten açıkça siliyor; bu ikinci emniyet).
-- Canlıya uygulandı: 2026-10-13 (27 sahipsiz satır silindi, 92 mülakat kaldı).

begin;

create temp table _orphan_interviews on commit drop as
select id from public.interviews i
where i.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or not exists (select 1 from auth.users u where u.id::text = i.user_id);

delete from public.interview_messages where interview_id in (select id from _orphan_interviews);
delete from public.interviews where id in (select id from _orphan_interviews);  -- analytics/anket zincirleme

-- Eski varsayılan 'anonymous' uuid'ye dönüşemez; backend user_id'yi her zaman açıkça yazar.
alter table public.interviews alter column user_id drop default;

alter table public.interviews
  alter column user_id type uuid using user_id::uuid,
  alter column user_id set not null,
  add constraint interviews_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.interview_messages
  drop constraint interview_messages_interview_id_fkey,
  add constraint interview_messages_interview_id_fkey
    foreign key (interview_id) references public.interviews(id) on delete cascade;

commit;
