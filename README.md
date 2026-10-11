# DeepInsight — Yapay Zeka Tabanlı Kariyer ve Mülakat Hazırlık Platformu

DeepInsight, adayların iş mülakatlarına hazırlanmasını uçtan uca destekleyen, birden fazla
kurumun (üniversite kariyer merkezi, bootcamp) birlikte kullanabildiği çok kiracılı bir
platformdur. Mülakat öncesinde CV'yi ve hedef ilanı analiz eder, mülakat sırasında yazılı,
sesli ya da görüntülü yapay zeka mülakatı yürütür, sonrasında gelişimi raporlar. Kurumlar
öğrencilerine ödev atayabilir ve öğrencinin rızası ölçüsünde ilerlemeyi izleyebilir.

## Özellikler

**Aday**
- **Yapay zeka mülakatı:** yazılı (token token akış), sesli ve görüntülü; rol, konu ve zorluğa
  göre RAG destekli soru bankası ve sunucu tarafında belirlenen mülakat sonu.
- **Multimodal analiz:** göz teması, duygu/stres, konuşma hızı, duraksama, dolgu kelime
  (Whisper, DeepFace, MediaPipe, librosa).
- **CV analizi:** PDF/DOCX/fotoğraf → metin ya da OCR → açıklanabilir ATS uyumluluk skoru →
  yapılandırılmış profil → **CV'ye özel mülakat**.
- **İlan eşleştirme:** ilan gereksinimleri, deterministik uyum skoru, eksik beceriler, öğrenme
  yol haritası, **ilana göre mülakat**.
- **Gelişimim:** zaman serisi, zayıf konular, kurala dayalı öneriler, PDF rapor.
- **Ödevlerim, Kurumlarım, Pilot Çalışma**, KVKK kapsamında **verilerimi indir / hesabımı sil**.

**Kurum (yönetici, eğitmen)**
- Kurum paneli: katılım, rızaya bağlı öğrenci skorları, en az 3 öğrencilik toplu istatistik.
- Gruplar (kohort), gruba göre görünüm, **ödev atama** ve teslim takibi.
- Davet kodu ve CSV ile **toplu davet** (kişi kendisi kabul eder), kurum soru bankası, aylık
  kota, **değerlendirme rubriği**, üye ve ödev sonuçları için CSV dışa aktarma.

**Platform**
- Kimliksiz pilot raporu (önce/sonra, t-testi, Wilcoxon, etki büyüklüğü, SUS) ve akademik
  ölçüm betikleri.

## Monorepo

| Dizin | Teknoloji | Açıklama |
|---|---|---|
| [`backend/`](backend/) | FastAPI, Supabase, OpenAI-uyumlu LLM | API, yetki, iş kuralları, analiz hattı |
| [`dashboard/`](dashboard/) | Next.js, Tailwind, Recharts | Web arayüzü (aday + kurum + admin) |
| [`mobile/`](mobile/) | Expo (React Native) | Aday mobil uygulaması |
| [`docs/`](docs/) | — | Mimari, API, güvenlik/KVKK, pilot protokolü, değerlendirme |

## Dokümantasyon

- [Mimari ve veri modeli](docs/ARCHITECTURE.md)
- [API uç noktaları](docs/API.md) (koddan üretilir: `python -m scripts.generate_api_doc`)
- [Güvenlik ve KVKK tasarımı](docs/SECURITY_AND_KVKK.md)
- [Pilot çalışma protokolü](docs/PILOT_PROTOCOL.md)
- [Akademik değerlendirme sonuçları](docs/evaluation/README.md)

## Hızlı başlangıç

**Gereksinimler:** Node.js 18+, Python 3.10+, FFmpeg (PATH'te), bir Supabase projesi, bir
OpenAI-uyumlu LLM API anahtarı (varsayılan: NVIDIA build.nvidia.com).

1. **Veritabanı:** `backend/sql/001…015` dosyalarını sırayla Supabase SQL Editor'de çalıştırın.
2. **Backend:**
   ```bash
   cd backend
   python -m venv venv && .\venv\Scripts\activate   # macOS/Linux: source venv/bin/activate
   pip install -r requirements.txt
   # .env: SUPABASE_URL, SUPABASE_KEY (service_role), LLM_API_KEY, LLM_BASE_URL — bkz. backend/README.md
   uvicorn app.main:app --reload --port 8000
   ```
3. **Dashboard:**
   ```bash
   cd dashboard
   npm install
   # .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000
   npm run dev
   ```
4. **Mobil:** `cd mobile && npm install && npx expo start` (API adresi `mobile/src/config/api.ts`).
5. İlk platform yöneticisi: `cd backend && python scripts/set_admin_role.py <e-posta>`.

## Test

```bash
cd backend && pytest tests -q            # 306 test, Supabase/LLM mock'lu
cd dashboard && npx tsc --noEmit && npx eslint src
```

## Yapay zeka analiz hattı (video/ses)

- **Duygu ve stres:** DeepFace ile karelerden duygu dağılımı; korku, kızgınlık, üzüntü ve
  iğrenmenin ağırlıklı ortalamasıyla stres düzeyi.
- **Göz teması ve göz kırpma:** MediaPipe FaceMesh ile iris konumu; EAR (göz en-boy oranı)
  ile göz kırpma sayısı.
- **Transkripsiyon:** Whisper ile Türkçe konuşmadan metne.
- **Dolgu kelime, duraksama, hız:** Türkçe dolgu kelime kalıpları ("ee", "şey", "yani"…),
  librosa ile 1,5 saniyeden uzun sessizlikler, dakikadaki kelime sayısı.
- **Özgüven skoru (0–100):** %30 göz teması, %25 düşük stres, %20 ideal konuşma hızı
  (120–160 kelime/dk), %15 az dolgu kelime, %10 akıcılık. Video analizi varsa gelişim ve kurum
  raporlarında LLM'in metinden tahmin ettiği özgüven yerine bu objektif ölçüm kullanılır.
