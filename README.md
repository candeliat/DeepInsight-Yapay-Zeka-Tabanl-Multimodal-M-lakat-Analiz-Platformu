# DeepInsight — Yapay Zeka Tabanlı Kariyer ve Mülakat Hazırlık Platformu

DeepInsight, adayların iş mülakatlarına hazırlanmasını uçtan uca destekleyen, birden fazla
kurumun (üniversite kariyer merkezi, bootcamp) birlikte kullanabildiği çok kiracılı bir
platformdur. Mülakat öncesinde CV'yi ve hedef ilanı analiz eder, mülakat sırasında yazılı,
sesli ya da görüntülü yapay zeka mülakatı yürütür, sonrasında gelişimi raporlar. Kurumlar
öğrencilerine ödev atayabilir ve öğrencinin rızası ölçüsünde ilerlemeyi izleyebilir.

## Özellikler

**Aday**
- **Yapay zeka mülakatı:** yazılı (token token akış), sesli ve görüntülü; rol, konu ve zorluğa
  göre RAG destekli soru bankası ve sunucu tarafında belirlenen mülakat sonu. Değerlendirme
  yapılamazsa mülakat 0 puanla kapatılmaz; cevaplar kayıtlı kalır ve "tekrar dene" sunulur.
  Yarıda kalan mülakata kaldığı yerden devam edilebilir.
- **CV'ye ve ilana göre mülakat:** yazılı ve görüntülü mülakatın kurulumunda CV ve/veya ilan
  seçilir; rol, konu ve zorluk önerilir, sorular CV'deki deneyime ve ilanın gereksinimlerine göre
  uyarlanır (mobilde de iki modda).
- **İngilizce mülakat modu:** sorular İngilizce sorulur (Türkçe banka soruları çevrilir), ses
  İngilizce çözümlenir, kelime puanı İngilizce iletişimi ölçer; geri bildirim Türkçe kalır.
- **STAR koçluğu:** davranışsal mülakatta her cevap Durum/Görev/Eylem/Sonuç açısından kural
  tabanlı değerlendirilir ("ben" yerine "biz" dili, ölçülebilir sonuç uyarıları).
- **Multimodal analiz:** göz teması, duygu/stres, konuşma hızı, duraksama, dolgu kelime
  (Whisper, DeepFace + MTCNN, MediaPipe, librosa). Analiz başarısız olursa sonuç ekranı bunu
  açıkça söyler; skorlar cevaplara göre yine hesaplanır.
- **Sonuç raporu:** genel skor 0–100 (yüzde değil), teknik/özgüven/iletişim alt puanları hem
  grafikte hem sayıyla, mülakat dökümü.
- **CV analizi:** PDF/DOCX/fotoğraf → metin ya da OCR → açıklanabilir ATS uyumluluk skoru →
  yapılandırılmış profil → **CV'ye özel mülakat**.
- **İlan eşleştirme:** ilan gereksinimleri, deterministik uyum skoru, eksik beceriler, öğrenme
  yol haritası, **ilana göre mülakat**.
- **Ön yazı üretici:** ilana ve CV'ye özel motivasyon mektubu (TR/EN, resmi/samimi); CV'de
  dayanağı olmayan sayı, beceri ve kısaltmalar uyarı olarak işaretlenir. Kaydedilmez.
- **Gelişimim:** zaman serisi (aynı gündeki mülakatlar saatle ayrılır), zayıf konular, kurala
  dayalı öneriler, PDF rapor ve zayıf konulardan soru bankasıyla **pratik seti** (iyi cevap
  maddeleri, "bu setle mülakat yap").
- **Bildirimler:** yeni ödev, son tarihe 24 saatten az kaldı, süresi geçti, eğitmen hatırlatması
  (web'de zil, mobilde Bildirimler ekranı).
- **Geri bildirim:** **hata bildirimi** ve **özellik önerisi**, isteğe bağlı ekran görüntüsüyle
  (web'de yapıştırarak da eklenir); gönderilenlerin durumu ve yönetici notu kullanıcıya görünür.
- **Ödevlerim, Kurumlarım, Pilot Çalışma**, KVKK kapsamında **verilerimi indir / hesabımı sil**.
- Web paneli telefon genişliğinde de kullanılabilir (açılır menü).

**Kurum (yönetici, eğitmen)**
- Kurum paneli: katılım, rızaya bağlı öğrenci skorları, en az 3 öğrencilik toplu istatistik.
- Gruplar (kohort), gruba göre görünüm, **ödev atama** ve teslim takibi.
- Davet kodu ve CSV ile **toplu davet** (kişi kendisi kabul eder), kurum soru bankası, aylık
  kota, **değerlendirme rubriği**, üye ve ödev sonuçları için CSV dışa aktarma.
- Tamamlamayan öğrencilere **ödev hatırlatması** (ödev başına 12 saatte bir).
- **Kurum raporu (PDF):** katılım, toplu skorlar, haftalık eğilim, konular, ödevler; öğrenci
  bazında veri içermez. Yöneticiye aylık **yapay zekâ kullanımı ve tahmini maliyet** paneli.

**Platform (admin)**
- **Admin paneli**
  - Platform geneli sayılar.
  - **Yapay zekâ kullanımı:** ay ya da tarih aralığı; özelliğe, modele, kuruma ve güne göre
    kırılım, tahmini maliyet, **hata türüne göre başarısız çağrılar** (zaman aşımı, geçersiz
    çıktı, model bulunamadı…) ve özellik başına son başarılı/başarısız çağrı zamanı.
  - **Yapay zekâ envanteri:** hangi özellik hangi modeli kullanıyor, özellik başına deneme süresi
    sınırı, dil modeli zincirinin canlı durumu (devre kesici).
  - **Geri bildirimler:** tüm kullanıcıların hata bildirimleri ve önerileri; gönderen, sayfa,
    platform, ekran görüntüsü, durum (yeni/inceleniyor/planlandı/çözüldü/reddedildi) ve not.
- **Soru bankası:** global soru yönetimi; arama, konu/zorluk/durum filtreleri ve sayfalama,
  yapay zekâ ile soru önerisi (insan onayından geçmeden bankaya girmez), boşluk kaydı.
- Kimliksiz pilot raporu (önce/sonra, t-testi, Wilcoxon, etki büyüklüğü, SUS) ve akademik
  ölçüm betikleri.

## Yapay zekâ nerede kullanılıyor

| Bileşen | Model / araç | Nerede çalışır | Kullanıldığı yer |
|---|---|---|---|
| Dil modeli zinciri | `nvidia/nemotron-3-ultra-550b-a55b` → `openai/gpt-oss-20b` → `nvidia/nemotron-3.5-lightning-30b-a3b` (sırayla, model başına devre kesicili) | NVIDIA API | Soru üretimi/sunumu, mülakat değerlendirmesi, CV profili, ilan gereksinimleri, yol haritası, ön yazı, soru önerisi |
| Embedding | `nvidia/nemotron-3-embed-1b` (API), `intfloat/multilingual-e5-base` (yerel) | API / sunucu | Soru bankasında anlamsal arama |
| Konuşmadan metne | Whisper (`small`) | Sunucu | Sesli cevap, video analizi, İngilizce mod |
| OCR | EasyOCR (TR+EN) | Sunucu | Taranmış/görsel CV |
| Görüntü/ses analizi | MediaPipe, DeepFace (yüz bulucu MTCNN), librosa | Sunucu | Göz teması, duygu/stres, konuşma hızı, duraksama |
| Kural tabanlı (yapay zekâ yok) | — | Sunucu | ATS ve ilan uyum skoru, STAR koçluğu, öneriler, pratik seti, dürüstlük kontrolü |

Zincirdeki modeller NVIDIA kataloğunda canlı istekle doğrulanmıştır; katalogdan kaldırılan bir
model 404 verir ve zincirden çıkarılmalıdır (admin panelinde "Model bulunamadı" olarak görünür).
Deneme süresi sınırı genel 30 sn, yapılandırılmış (JSON) çıktıda 60 sn, ön yazıda 110 sn. Tüm
modeller başarısız olursa kullanıcıya sağlayıcının ham hatası değil, genel bir "servise şu an
ulaşılamıyor" mesajı gösterilir.

Canlı durum ve kullanım: **Admin paneli → Yapay zekâ envanteri / kullanımı**. Her model denemesi
`llm_usage` tablosuna (amaç, model, başarı, hata türü, gecikme, token; içerik yok) yazılır.

## Monorepo

| Dizin | Teknoloji | Açıklama |
|---|---|---|
| [`backend/`](backend/) | FastAPI, Supabase, OpenAI-uyumlu LLM | API, yetki, iş kuralları, analiz hattı |
| [`dashboard/`](dashboard/) | Next.js 16, Tailwind, Recharts | Web arayüzü (aday + kurum + admin) |
| [`mobile/`](mobile/) | Expo (React Native) | Aday mobil uygulaması |
| [`e2e/`](e2e/) | Playwright | Web ve mobil web uçtan uca testleri (backend taklitli) |
| [`docs/`](docs/) | — | Mimari, API, güvenlik/KVKK, pilot protokolü, değerlendirme, araştırma |

## Dokümantasyon

- [Mimari ve veri modeli](docs/ARCHITECTURE.md)
- [API uç noktaları](docs/API.md) (koddan üretilir: `cd backend && python -m scripts.generate_api_doc`)
- [Güvenlik ve KVKK tasarımı](docs/SECURITY_AND_KVKK.md)
- [Pilot çalışma protokolü](docs/PILOT_PROTOCOL.md)
- [Akademik değerlendirme sonuçları](docs/evaluation/README.md)
- [Mülakat ve ATS araştırması](docs/research/MULAKAT_VE_ATS_ARASTIRMASI.md) (soru bankası ve ATS kontrollerinin kaynakları)

## Hızlı başlangıç

**Gereksinimler:** Node.js 22, Python 3.13, bir Supabase projesi, bir OpenAI-uyumlu LLM API
anahtarı (varsayılan: NVIDIA build.nvidia.com). FFmpeg'in ayrıca kurulması gerekmez:
`imageio-ffmpeg` paketiyle gelir (PATH'te bir `ffmpeg` varsa o kullanılır).

1. **Veritabanı:** `backend/sql/000…025` dosyalarını sırayla Supabase SQL Editor'de (ya da
   `python scripts/run_sql.py <dosya>` ile) çalıştırın.
2. **Backend:**
   ```bash
   cd backend
   python -m venv venv && .\venv\Scripts\activate   # macOS/Linux: source venv/bin/activate
   pip install -r requirements.txt
   # .env: SUPABASE_URL, SUPABASE_KEY (service_role), LLM_API_KEY, LLM_BASE_URL — bkz. backend/README.md
   # İsteğe bağlı: LLM_PRICES_JSON='{"model": {"input": 0.1, "output": 0.4}}' (USD/1M token, maliyet tahmini)
   uvicorn app.main:app --reload --port 8000
   ```
   Video analizi için TensorFlow, `tf-keras` ve `mtcnn` sürümleri `requirements.txt`'de birlikte
   sabitlenmiştir; DeepFace `tf-keras` olmadan açılmaz.
3. **Dashboard:**
   ```bash
   cd dashboard
   npm install
   # .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000
   npm run dev
   ```
4. **Mobil:**
   ```bash
   cd mobile
   npm install
   cp .env.example .env   # EXPO_PUBLIC_API_URL: telefonda bilgisayarın yerel ağ IP'si, Expo web için localhost
   npx expo start
   ```
5. İlk platform yöneticisi: `cd backend && python scripts/set_admin_role.py <e-posta>`.

## Test

```bash
cd backend && pytest tests -q            # ~510 test, Supabase/LLM mock'lu
cd dashboard && npx tsc --noEmit && npx eslint src
cd mobile && npx tsc --noEmit && npx expo lint
cd e2e && npm test                       # ~115 Playwright testi (web + mobil web), backend taklitli
```

GitHub Actions her PR'da backend testlerini ve uçtan uca testleri çalıştırır. CI ağır makine
öğrenmesi paketlerini (DeepFace, TensorFlow, Whisper, MediaPipe…) kurmaz; bunlara dokunan
kod testlerde taklit edilir.

## Yapay zeka analiz hattı (video/ses)

Görüntülü mülakat kaydı bittiğinde sunucuya yüklenir ve tek işçili bir kuyrukta analiz edilir
(kullanıcıya sıradaki konumu gösterilir). Kareler saniyede bir, 640 px genişliğe küçültülerek
örneklenir (en fazla 300 kare); video dosyası analizden sonra silinir.

- **Duygu ve stres:** DeepFace ile karelerden duygu dağılımı (yüz önce MTCNN ile bulunur);
  korku, kızgınlık, üzüntü ve iğrenmenin ağırlıklı ortalamasıyla stres düzeyi.
- **Göz teması ve göz kırpma:** MediaPipe FaceMesh ile iris konumu; EAR (göz en-boy oranı)
  ile göz kırpma sayısı.
- **Transkripsiyon:** Whisper ile konuşmadan metne (mülakat diline göre Türkçe ya da İngilizce).
- **Dolgu kelime, duraksama, hız:** Türkçe dolgu kelime kalıpları ("ee", "şey", "yani"…;
  İngilizce modda "um", "uh", "like", "you know"…),
  librosa ile 1,5 saniyeden uzun sessizlikler, dakikadaki kelime sayısı.
- **Özgüven skoru (0–100):** %30 göz teması, %25 düşük stres, %20 ideal konuşma hızı
  (120–160 kelime/dk), %15 az dolgu kelime, %10 akıcılık. Video analizi varsa gelişim ve kurum
  raporlarında LLM'in metinden tahmin ettiği özgüven yerine bu objektif ölçüm kullanılır.
