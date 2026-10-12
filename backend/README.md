# DeepInsight Backend (Merkezi Python API)

Bu dizin, DeepInsight platformunun veritabanı (Supabase) koordinasyonunu sağlayan ve mülakat video/ses dosyalarını işleyip yapay zeka analizlerini gerçekleştiren **FastAPI** tabanlı Python backend servisidir.

---

## 🚀 Başlangıç

Backend sunucusunu yerel ortamda çalıştırmak için aşağıdaki adımları uygulayın:

1. Bu dizine geçiş yapın:
   ```bash
   cd backend
   ```

2. Python sanal ortamı (venv) oluşturun ve aktif edin:
   ```bash
   python -m venv venv
   # Windows için:
   .\venv\Scripts\activate
   # macOS/Linux için:
   source venv/bin/activate
   ```

3. Gerekli kütüphaneleri yükleyin:
   ```bash
   pip install -r requirements.txt
   ```

4. Gerekli ortam değişkenlerini tanımlamak için `.env` dosyasını oluşturun ve doldurun:
   ```env
   SUPABASE_URL=https://your-supabase-project.supabase.co
   # ÖNEMLİ: Bu MUTLAKA service_role (secret) key olmalı, anon/publishable key DEĞİL.
   # Tüm tablolarda RLS açık ve politika yok (bkz. sql/014): veritabanına yalnızca
   # backend erişir, yetki kontrolü route katmanındadır (docs/SECURITY_AND_KVKK.md).
   # Bu anahtar istemcilere (dashboard/mobil) asla verilmemelidir.
   # Supabase panelinde: Project Settings → API → "service_role" (secret).
   SUPABASE_KEY=your-supabase-service-role-key

   # Mülakat LLM motoru — OpenAI-uyumlu herhangi bir sağlayıcı kullanılabilir.
   # Örnek: NVIDIA build.nvidia.com (canlı doğrulanmış, llm_service.py'deki
   # varsayılan FREE_MODELS listesi buna göre ayarlı):
   LLM_API_KEY=your-nvidia-or-openrouter-api-key
   LLM_BASE_URL=https://integrate.api.nvidia.com/v1
   # OpenRouter kullanmak isterseniz: LLM_BASE_URL=https://openrouter.ai/api/v1
   # ve llm_service.py'deki FREE_MODELS listesini ":free" OpenRouter model
   # slug'larıyla değiştirin.

   WHISPER_MODEL=base
   ANALYSIS_FPS=1

   # Mülakat motoru ayarları (opsiyonel, varsayılanlar aşağıdaki gibidir)
   MAX_INTERVIEW_QUESTIONS=5
   LLM_REQUEST_TIMEOUT=60
   # PAID_FALLBACK_MODELS'e (bkz. llm_service.py) izin vermek isterseniz true
   # yapın — varsayılan kapalı, yalnızca FREE_MODELS listesi kullanılır.
   ENABLE_PAID_MODEL_FALLBACK=false
   ```

5. Sunucuyu başlatın:
   ```bash
   uvicorn app.main:app --reload
   ```

6. API Dokümantasyonuna tarayıcınızdan erişin:
   *   Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
   *   ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 📂 Klasör Yapısı

*   `app/main.py`: FastAPI uygulamasının başlatıldığı, CORS ayarlarının yapıldığı ve yönlendiricilerin (routers) dahil edildiği giriş dosyası.
*   `app/api/routes`: API uç noktalarının (endpoints) tanımlandığı yönlendiriciler (tam liste: [`docs/API.md`](../docs/API.md)):
    *   `auth.py`, `users.py`: kimlik doğrulama, token yenileme, profil.
    *   `interview.py`: mülakat başlatma (CV/ilan/kurum/ödev bağlamıyla), sohbet (`/chat` ve SSE `/chat/stream`), erken bitirme, transkripsiyon.
    *   `analytics.py`: video/ses analizi başlatma, durum ve sonuçlar.
    *   `cv.py`, `jobs.py`, `progress.py`: CV/ATS, ilan eşleştirme, gelişim ve PDF rapor.
    *   `organizations.py`, `assignments.py`: kurumlar, üyeler, gruplar, davetler, kurum soru bankası, ödevler, CSV dışa aktarma.
    *   `pilot.py`, `account.py`: pilot çalışma (onam, anketler, rapor) ve KVKK veri hakları.
    *   `question_bank_admin.py`: global soru bankası yönetimi (platform admini).
*   `app/api/schemas`: API istek ve yanıtlarında veri doğrulama için kullanılan Pydantic şemaları.
*   `app/core`: Veritabanı (Supabase) ve genel yapılandırma ayarları (`config.py`, `database.py`).
*   `app/services`: Ana iş mantığını ve AI entegrasyonlarını barındıran servisler:
    *   `analytics.py`: **Multimodal Analiz Motoru** (DeepFace, MediaPipe, Whisper ve Librosa pipeline'ı).
    *   `llm_service.py`: OpenAI-uyumlu bir LLM sağlayıcısı (varsayılan: NVIDIA build.nvidia.com) üzerinden, fallback+backoff'lu model havuzuyla mülakat soruları üretme ve aday cevaplarına yazılı geri bildirim oluşturma servisi.
    *   `prompts/`: Versiyonlanmış sistem promptları (`interview_v1.py`) — mülakat sorusu ve nihai değerlendirme promptları.
    *   `whisper_service.py`: `analytics.py` ve `llm_service.py` arasında paylaşılan tekil (singleton) Whisper model yükleyicisi.
    *   `interview_service.py`: Mülakat sürecinin akışını yöneten servis.

---

## ✅ Test ve Doğrulama

*   **Otomatik testler** (`tests/`, mock'lu — gerçek API/DB'ye dokunmaz):
    ```bash
    pip install -r requirements-dev.txt
    pytest tests/ -v
    ```
*   **Akademik ölçüm betikleri** (`scripts/eval/`): embedding karşılaştırması, LLM değerlendirici tutarlılığı, ATS dayanıklılığı — bkz. [`docs/evaluation`](../docs/evaluation/README.md).
*   **Manuel canlı doğrulama script'leri** (gerçek `.env` + gerçek API çağrısı gerektirir, kota/kredi harcar, pytest'e dahil değildir):
    *   `python check_llm_live.py` — `llm_service`'i gerçek LLM sağlayıcısına karşı çalıştırıp soru üretme + JSON değerlendirme akışını doğrular (Supabase gerekmez).
    *   `python check_interview_e2e.py` — çalışan bir sunucuya (`uvicorn app.main:app --port 8123`) karşı kayıt→giriş→5 soruluk mülakat→değerlendirme→kalıcılık akışının tamamını gerçek HTTP istekleriyle test eder.
    *   `python check_stream_e2e.py` — aynı akışı `/interview/chat/stream` SSE uç noktası üzerinden, gerçek token-token akışı konsola basarak test eder.

---

## ⚙️ Yapay Zeka Pipeline Detayları

Adayın yüklediği video dosyası backend'e ulaştığında sırasıyla şu işlemler gerçekleştirilir:

1. **Ses Ayıklama**: Video dosyasından ses kanalı `FFmpeg` kullanılarak 16kHz WAV formatında ayıklanır.
2. **Kare Çıkarma**: Video dosyası saniyede 1 kare (veya yapılandırılan FPS değerine göre) BGR numpy dizilerine dönüştürülür.
3. **DeepFace Duygu Analizi**: Çıkarılan kareler `DeepFace.analyze` işlemine tabi tutularak baskın duygular ve stres oranı ölçülür.
4. **MediaPipe Göz Teması Takibi**: `FaceLandmarker` modeli ile irisin göz merkezine uzaklığı (göz teması oranı) ve EAR formülüyle göz kırpma sayısı tespit edilir.
5. **Whisper Konuşma Transkripsiyonu**: `Whisper` ses modeline beslenen ses kaydından Türkçe transkripsiyon metni çıkarılır.
6. **Librosa Duraksama Analizi**: `librosa.effects.split` fonksiyonu yardımıyla konuşmadaki 1.5 saniyeden uzun sessizlikler tespit edilir.
7. **Metrik Hesaplamaları & Supabase Kaydı**: Konuşma hızı (WPM), dolgu kelimelerin tespiti ve ağırlıklı formülle genel özgüven yüzdesi hesaplanıp `interview_analytics` tablosuna kaydedilir.
