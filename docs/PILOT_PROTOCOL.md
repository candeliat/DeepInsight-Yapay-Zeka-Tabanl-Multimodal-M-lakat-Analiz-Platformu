# Pilot çalışma protokolü

Taslak protokoldür. Üniversite etik kurulu ya da danışman onayına göre uyarlanmalıdır.

## Amaç ve araştırma soruları

1. **AS1:** Platformla düzenli pratik yapan adayların mülakat performans skoru zamanla artıyor mu?
2. **AS2:** Kullanıcılar platformu kullanılabilir buluyor mu (SUS)?
3. **AS3:** Kullanıcılar mülakat deneyimini faydalı, gerçekçi ve geri bildirimi anlaşılır buluyor mu?

## Tasarım

Tek gruplu, tekrarlı ölçümlü önce/sonra tasarım. Kontrol grubu yoktur. Bu yüzden gelişimin
tamamı platforma atfedilemez; pratik etkisi, konu/zorluk farkı ve LLM puanlamasındaki
değişkenlik de rol oynar. Sınırlılık raporlarda açıkça belirtilir. Zaman ve katılımcı
varsa güçlendirme önerisi: katılımcıları rastgele iki gruba ayırıp birine yalnızca soru
listesi (geri bildirimsiz), diğerine platformu vermek.

## Katılımcılar

- Hedef: 15–20 kişi (son sınıf öğrencisi / yeni mezun; yazılım alanı).
- Dahil etme: gönüllülük, en az 2 hafta katılım, araştırma onamı.
- Hariç tutma: araştırmacının yakın çalışma arkadaşları (yanlılık riski).

## İşlem

| Adım | Ne | Platformdaki karşılığı |
|---|---|---|
| 0 | Bilgilendirme ve onam | `/pilot` → onam metni (sürüm 2026-10-v1) |
| 1 | Ön ölçüm: ilk mülakat | Yazılı mülakat; mümkünse aynı rol/konu/zorluk sabit tutulur (kurum ödevi olarak atanabilir) |
| 2 | Pratik dönemi (2–3 hafta) | Haftada en az 2 mülakat, Gelişimim önerileri, CV/ilan modülleri |
| 3 | Her mülakattan sonra kısa anket | Sonuç ekranında 3 madde (1–5) |
| 4 | Son ölçüm: son mülakat | Ön ölçümle aynı rol/konu/zorluk |
| 5 | SUS anketi | `/pilot` → 10 madde |

Ön ve son ölçümün karşılaştırılabilir olması için kurum paneliyle aynı rol/konu/zorlukta iki
ödev (ör. "Ön ölçüm", "Son ölçüm") atanması önerilir.

## Ölçümler

- **Birincil:** mülakat genel skoru (teknik, özgüven, iletişim ortalaması; 0–100), ilk ve
  son mülakat. Duyarlılık analizi olarak en az 4 mülakatı olanlarda ilk 2 / son 2 ortalaması.
- **İkincil:** SUS (0–100; 68 ortalama kabul edilir), mülakat sonrası anket maddeleri (1–5).
- **Ölçüm aracının güvenilirliği:** LLM değerlendiricinin test-tekrar güvenilirliği ayrıca
  ölçülmüştür (ICC(2,1) = 0,968; bkz. [evaluation/README.md](evaluation/README.md)).

## Analiz planı

- Eşleştirilmiş t-testi ve Wilcoxon işaretli sıra testi (küçük örneklemde Wilcoxon esas
  alınır), etki büyüklüğü Cohen's dz, gelişen/gerileyen katılımcı sayısı.
- SUS ortalaması ve Sauro-Lewis yorum aralığı; anket maddelerinin ortalamaları.
- Raporlama: `/pilot/report` (platform admini) ve CSV dışa aktarma.

## Etik ve veri koruma

- Katılım gönüllüdür; onam her an geri çekilebilir. Geri çekilince anket yanıtları silinir ve
  kişi analizden çıkar. Platformu kullanmak katılıma bağlı değildir.
- Rapor ve CSV kimliksizdir (P01, P02…); ad ve e-posta araştırma çıktısına girmez.
- Kişi kendi verisini indirebilir ve hesabını tamamen silebilir (KVKK md. 11).
- Veriler yalnızca bu araştırma ve platformun geliştirilmesi amacıyla kullanılır.
