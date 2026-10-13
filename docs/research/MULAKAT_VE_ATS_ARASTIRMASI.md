# Mülakat soruları ve ATS: araştırma notları

*Tarih: 2026-10-13. Amaç: soru bankasının (backend/data/question_bank) ve ATS skorunun (app/services/ats_service.py) dayanağını kayıt altına almak; yapay zekânın kendi tahminine değil kürasyonlu bir referansa dayanmasını sağlamak.*

## Kanıt düzeyi

Kaynakların önemli kısmı kariyer blogları ve aday yorumlarıdır. Bu yüzden her bulgu bir düzeyle işaretlenmiştir:

- **[R] Resmi:** ürünün kendi belgeleri, üniversite kariyer merkezleri.
- **[Ç] Çoklu:** birbirinden bağımsız birden çok kaynakta tekrar eden bilgi.
- **[T] Tekil:** tek kaynak ya da aday yorumu. Eğilim gösterir, kesin değildir.

## 1. Türkiye'de yazılım mülakat süreci

- **[Ç] Aşamalar:** Süreç genellikle şu sırayla ilerler:
  1. İK ön görüşmesi: kendini tanıtma, motivasyon, şirket bilgisi.
  2. Teknik mülakat: çoğu zaman kıdemli bir geliştiriciyle.
  3. Bazı şirketlerde online test ya da canlı kodlama.

  Aşama sayısı ve sırası şirkete göre değişir ([İşteMülakat – junior](https://istemulakat.com/meslek/junior-yazilim-gelistirme-uzmani/mulakatlari), [Kariyer.net – junior](https://www.kariyer.net/pozisyonlar/junior+yazilim+gelistirme+uzmani/mulakatlar)).
- **[Ç] Junior adaylarda sık konular:**
  - OOP'nin dört ilkesi ve SOLID
  - SQL
  - Veri yapıları ve algoritmalar
  - Mikroservis kavramları
  - Java ya da C# ile canlı OOP kodlaması
- **[T] Teknik oturum süresi:** 60–90 dakika olabilir ([goit](https://goit.global/tr/articles/en-cok-sorulan-yazilim-mulakat-sorulari-kapsamli-hazirlik-rehberi/)).

**Ürüne yansıması:** Bankaya rol bağımsız "temeller" grubu eklendi: SQL ve veritabanları, OOP ve SOLID, veri yapıları ve algoritmalar, REST/HTTP, Git, sistem tasarımı. Rol etiketleri bu temelleri ikinci planda havuza katabilir.

## 2. Rollere göre konu kapsamı

- **[Ç] Frontend:** React ve TypeScript ağırlıklı. Sık sorulanlar:
  - state ve props farkı
  - Yeniden render'ın ne zaman olduğu
  - Memoization
  - key kullanımı

  ([consultadd](https://consultadd.com/blog/interview-questions-for-a-full-stack-developer), [GUVI](https://www.guvi.in/blog/most-important-react-interview-questions/))
- **[Ç] Java/Spring backend:**
  - Çekirdek Java: OOP, koleksiyonlar, bellek
  - Spring Boot katmanları: controller, service, repository
  - REST tasarımı
  - Junior seviyede CRUD ağırlıklı sorular

  ([consultadd Java](https://consultadd.com/blog/java-full-stack-developer-interview-questions))
- **[Ç] SQL:** İndeksler, join ve toplama fonksiyonları, transaction ve ACID, N+1 problemi. Bir kaynağa göre full-stack adayları en çok zayıf SQL yüzünden eleniyor ([consultadd](https://consultadd.com/blog/interview-questions-for-a-full-stack-developer)).
- **[T] Sistem tasarımı:** Junior adaya basit bir REST API tasarımı sorulur. Ölçekleme soruları kıdemli adaylara bırakılır.
- **[T] Mobil (Flutter):** state management, widget yaşam döngüsü, yerelleştirme ([Kodeco](https://kodeco.com/10971345-flutter-interview-questions-and-answers?page=1), [Adaface](https://adaface.com/blog/flutter-interview-questions)).
- **[T] DevOps:** CI/CD, Linux, Docker/Kubernetes, Terraform ile Ansible farkı ve senaryo soruları ([Adaface](https://adaface.com/blog/devops-interview-questions)).
- **[T] QA:** regresyon, keşif ve kabul testi farkları, bir özellik için test senaryosu yazma, temel SQL.

**Ürüne yansıması:** Banka 4 konudan 21 konuya çıktı. Her konuda zorluk seviyesi başına en az 4 soru var; sistem tasarımında JUNIOR yok.

## 3. Davranışsal (STAR) sorular

- **[R] Yöntem:** STAR, Situation (durum), Task (görev), Action (eylem) ve Result (sonuç) aşamalarından oluşur. Davranışsal sorular çoğunlukla "Bana ... bir zamanı anlatın" diye başlar ([Texas A&M](https://careercenter.tamu.edu/blog-graduate-students-career-readiness/april-2020/the-s-t-a-r-method-for-behavioral-interviews), [WPI](https://www.wpi.edu/sites/default/files/inline-image/Offices/Career-Development-Center/CDC_Tipsheets_2020_Answering%20Interview%20Questions%20Using%20the%20STAR%20Method.pdf)).
- **[R] Ağırlık önerisi:** Durum anlatımı cevabın yaklaşık %20'si, görev yaklaşık %10'u olmalı; geri kalan eylem ve sonuçtur ([University of Washington](https://careers.uw.edu/resources/star-method-of-interviewing/)).
- **[R] Anlatım:** Genellemeler yerine somut örnekler ve "ben" cümleleri kullanılmalı ([MIT CAPD, Dartmouth üzerinden](https://guarinigrad.dartmouth.edu/resources/using-the-star-method-for-your-next-behavioral-interview/)).
- **[T] Sık temalar:** çatışma, başarısızlık, yöneticiyle anlaşmazlık, önceliklendirme ([generalistprogrammer](https://www.generalistprogrammer.com/tutorials/behavioral-interview-questions-star-method)).

**Ürüne yansıması:** 12 davranışsal soru `question_type='davranissal'` olarak eklendi. Bu sorular teknik mülakat havuzuna karışmaz, yalnızca konu davranışsal mülakat olduğunda seçilir. Her sorunun "iyi cevap noktaları" STAR öğelerine göre yazıldı. Planlanan STAR koçluğu özelliği bu temeli kullanacak.

## 4. ATS (başvuru takip sistemleri)

### 4.1 Nasıl çalışır

- **[Ç] İşleyiş:** ATS önce CV'yi ayrıştırır (iletişim, deneyim, eğitim, beceriler), sonra alanları indeksler, ilanla eşleştirir ve adayları sıralar. Eşleştirme çoğu sistemde anahtar kelime örtüşmesidir. Bazı gelişmiş sistemler eş anlamlıları da tanır ([Wikipedia](https://en.wikipedia.org/wiki/Applicant_tracking_system), [Indeed](https://www.indeed.com/career-advice/resumes-cover-letters/automated-screening-resume), [oleeo](https://www.oleeo.com/blog/what-is-an-applicant-tracking-system-ats/)).
- **[Ç] Zorunlu nitelikler:** Zorunlu bir niteliğin eksik olması, anahtar kelime örtüşmesinden daha belirleyici olabilir. Aday puanlamadan önce elenebilir.
- **[Ç] Kısaltmalar:** Kısaltma ile açılımı birlikte yazılmalı, örneğin "Amazon Web Services (AWS)" ([quickcv](https://quickcv.io/blog/how-ats-systems-work-2026)).
- **[Ç] Gizli metin:** Gizli ya da beyaz renkli anahtar kelimeler modern sistemlerce tespit edilebilir ve başvuruyu işaretletebilir.

### 4.2 Ayrıştırmayı bozan durumlar

- **[R] Greenhouse:** Greenhouse'un resmi destek makalesine göre ([Greenhouse – Unsuccessful resume parse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)):
  - 2,5 MB'tan büyük CV'ler ayrıştırılamaz.
  - Grafik, fotoğraf ve "word art" ayrıştırmayı bozar.
  - Yalnızca görüntüden oluşan dosyalar okunamaz.
  - Tablo, üst bilgi (header) ve alt bilgi (footer) içeren karmaşık düzenler ayrıştırmayı bozar.
  - Ayrıştırma başarısız olursa CV yalnızca ek olarak tutulur; alanlar elle doldurulur.
- **[Ç] Workday ve diğerleri:** Topluluk kaynaklarına göre ([resumegeni](https://resumegeni.com/blog/ats-system-guide), [jobshinobi](https://jobshinobi.com/blog/how-to-optimize-resume-for-workday-ats)):
  - Üst ve alt bilgi alanları okunmaz; bu alana yazılmış iletişim bilgisi kaybolur.
  - Tablo hücreleri karışabilir.
  - Çok sütunlu düzen en sık görülen hatadır.
  - Standart dışı bölüm başlıkları ve tarih biçimleri alanlara yerleşmeyebilir.
  - Tasarım araçlarından alınan PDF'ler sorun çıkarır.
- **[T] Türkiye:** Türkçe kaynaklar da sade biçim, standart başlıklar ve ilan anahtar kelimeleri öneriyor. Ancak bulunan kaynaklar tek bir ticari blog ağındandır ve Kariyer.net'in resmi bir yönergesine ulaşılamadı. Türkiye'de CV'lere fotoğraf eklemek yaygındır; yukarıdaki [R] bulgusuna göre bu ayrıştırmayı bozabilir ([stylingcv](https://stylingcv.com/tr/ats-uyumlu-cv/)).

### 4.3 Mevcut ATS skorumuzla karşılaştırma

| Bulgu | Kaynak düzeyi | Bizde |
|---|---|---|
| Makine tarafından okunabilir metin (görüntü CV değil) | R | Var (`text_layer`) |
| Tek sütun | Ç | Var (`single_column`) |
| İletişim bilgisi | Ç | Var (`contact`) |
| Standart bölüm başlıkları | Ç | Var (`sections`) |
| Tarih aralıkları | Ç | Var (`dates`) |
| Tablo ve özel karakter | R | Var (`formatting`) |
| Ölçülebilir başarılar | Ç (işe alımcı tarafı) | Var (`quantified`) |
| İlan anahtar kelime örtüşmesi | Ç | İlan eşleştirmede var (`skill_matching`), ATS skorunda yok |
| İletişim bilgisinin üst/alt bilgide olması | R + Ç | **Yok**: sonraki PR |
| Fotoğraf ya da grafik | R | **Yok**: sonraki PR |
| Dosya boyutu (> 2,5 MB) | R | **Yok**: sonraki PR |
| Kısaltma ve açılım | Ç | **Yok**: sonraki PR (öneri olarak) |
| Gizli ya da beyaz metin | Ç | **Yok**: sonraki PR |

ATS skoru bir **tahmindir**: her şirketin sistemi farklıdır. Arayüz bunu zaten belirtiyor; yeni kontroller de bu çerçevede açıklanabilir öneriler olarak eklenecek.

## 5. Soru bankasının kürasyon ilkeleri

1. **Etiket önce, embedding yedek.** Canlı ölçümde (2026-10-12) embedding benzerliği konu ayrımı yapamadı:
   - "Backend / Python / ORTA" sorgusu bankadaki kendi Python sorularına 0,18 benzerlik verdi. Eşik 0,22 olduğu için bu sorular hiç kullanılmadı.
   - "Veri Yapıları" sorgusu alakasız bir makine öğrenmesi sorusuna 0,24 verdi ve eşiği geçti.

   Bu yüzden soru seçimi önce kanonik beceri etiketleriyle (`app/services/question_tags.py`) yapılıyor. Embedding yalnızca konu tanınmadığında ya da bankada yeterli soru olmadığında devreye giriyor.
2. **Kanonik etiketler.** Etiketler ilan eşleştirmedeki `skill_key` sözlüğüyle aynı ("ReactJS" ve "react" aynı etiket). Böylece CV ve ilan becerileri de aynı dille eşleşiyor.
3. **İyi cevap noktaları.** Her sorunun "güçlü bir cevapta beklenenler" listesi var. Bu liste adaya gösterilmez; mülakat sonu değerlendirmesinde ölçüt olarak verilir. Liste eksiksiz bir cevap anahtarı değildir: doğru ve gerekçeli farklı bir yaklaşım cezalandırılmaz.
4. **Zorluk.** Zorluk birebir eşleşen sorular önce gelir. Yeterli soru yoksa komşu zorluk seviyesi kullanılır, uzak seviye en son.
5. **Çeşitlilik.** Sık sorulan sorular hafifçe geriye itilir; eşit puanlıların sırası küçük bir rastgelelikle değişir.
6. **Tekrar etmeme.** Aynı kapsamdaki aktif sorularda soru metni benzersizdir (`sql/017`). Anlamca aynı iki eski soru pasifleştirildi.

## 6. Bilinen sınırlar ve açık konular

- Soru frekansları doğrulanmamıştır; çoğu kaynak tekil ya da blogdur. Bu bilgi tabanı "en sık sorulanlar"ın kesin listesi değil, kapsamlı ve dengeli bir başlangıç setidir.
- Kariyer.net ve İŞKUR'un resmi ATS yönergelerine ulaşılamadı.
- "İyi cevap noktaları" alan uzmanlarınca gözden geçirilmelidir. Soru bankası yönetici ekranından düzenlenebilir.
- Kurumların kendi soruları (`org_id`) aynı etiket sistemiyle seçilir. Kurum soru bankası arayüzü henüz yok.
