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
   SUPABASE_KEY=your-supabase-service-role-or-anon-key
   GEMINI_API_KEY=your-google-gemini-api-key
   WHISPER_MODEL=base
   ANALYSIS_FPS=1
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
*   `app/api/routes`: API uç noktalarının (endpoints) tanımlandığı yönlendiriciler:
    *   `auth.py`: Kullanıcı kimlik doğrulama işlemleri.
    *   `users.py`: Kullanıcı profil işlemleri.
    *   `interview.py`: Mülakat oluşturma, başlatma, video/ses yükleme ve analiz tetikleme işlemleri.
    *   `analytics.py`: Analiz durumunu ve sonuçlarını getiren uç noktalar.
*   `app/api/schemas`: API istek ve yanıtlarında veri doğrulama için kullanılan Pydantic şemaları.
*   `app/core`: Veritabanı (Supabase) ve genel yapılandırma ayarları (`config.py`, `database.py`).
*   `app/services`: Ana iş mantığını ve AI entegrasyonlarını barındıran servisler:
    *   `analytics.py`: **Multimodal Analiz Motoru** (DeepFace, MediaPipe, Whisper ve Librosa pipeline'ı).
    *   `llm_service.py`: Gemini API ile mülakat soruları üretme ve aday cevaplarına yazılı geri bildirim oluşturma servisi.
    *   `interview_service.py`: Mülakat sürecinin akışını yöneten servis.

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
