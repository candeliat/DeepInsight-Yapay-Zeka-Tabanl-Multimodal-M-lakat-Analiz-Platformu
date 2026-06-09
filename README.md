# DeepInsight — Yapay Zeka Tabanlı Multimodal Mülakat Analiz Platformu

DeepInsight, adayların iş mülakatlarındaki performanslarını yapay zeka yardımıyla analiz eden multimodal (çok modlu) bir mülakat analiz platformudur. Platform; adayın video ve ses kayıtlarını analiz ederek göz teması, duygu durumu, stres düzeyi, konuşma hızı, duraksamalar ve dolgu kelime kullanımı gibi kritik metrikleri ölçer ve adaya kapsamlı bir özgüven/performans raporu sunar.

---

## 🏗️ Proje Mimarısı (Monorepo)

Proje üç ana bileşenden oluşmaktadır:

1. **[Backend](file:///c:/Users/apode/Desktop/DeepInsight/backend)**: Analiz motorunu barındıran, FastAPI tabanlı merkezi Python sunucusu.
2. **[Dashboard (Web)](file:///c:/Users/apode/Desktop/DeepInsight/dashboard)**: IK yöneticileri veya adayların mülakat sonuçlarını detaylı grafiklerle inceleyebileceği Next.js web arayüzü.
3. **[Mobile App](file:///c:/Users/apode/Desktop/DeepInsight/mobile)**: Adayların mülakatları gerçekleştirdiği, kamera ve ses kaydı alan Expo (React Native) mobil uygulaması.

---

## 🧠 Yapay Zeka ve Analiz Pipeline'ı

Backend tarafındaki Python tabanlı analiz motoru, açık kaynak kodlu ve modern yapay zeka modellerini bir araya getirir:

### 📹 Görüntü Analizi (`VideoAnalyzer`)
*   **Duygu Analizi (Emotion Detection)**: `DeepFace` kullanılarak adayın yüz ifadelerinden anlık duygu durumları (mutlu, nötr, üzgün, kızgın, korku vb.) analiz edilir.
*   **Stres Ölçümü**: Korku, kızgınlık, üzüntü ve iğrenme duygularının ağırlıklı ortalamasıyla adayın anlık stres düzeyi hesaplanır.
*   **Göz Teması & Bakış Takibi (Gaze Tracking)**: `MediaPipe FaceMesh` kullanılarak adayın göz irisi ve göz çerçevesi koordinatları tespit edilir. Adayın doğrudan kameraya bakıp bakmadığı (göz teması oranı) ölçülür.
*   **Göz Kırpma Tespiti (Blink Detection)**: EAR (Eye Aspect Ratio - Göz En Boy Oranı) formülü kullanılarak mülakat sırasındaki toplam göz kırpma sayısı hesaplanır.

### 🔊 Ses ve Dil Analizi (`AudioAnalyzer`)
*   **Metne Dönüştürme (Transkripsiyon)**: `OpenAI Whisper` modeli kullanılarak Türkçe ses kayıtları yüksek doğrulukla metne dönüştürülür.
*   **Dolgu Kelime Tespiti (Filler Words)**: Regex pattern'leri ile konuşma metnindeki Türkçe dolgu kelimeleri ("ee", "ııı", "şey", "yani", "hani", "işte", "aslında") tespit edilerek sayılır ve raporlanır.
*   **Sessizlik ve Duraksama Tespiti (Pause Detection)**: `Librosa` ses analiz kütüphanesi kullanılarak konuşma aralarındaki 1.5 saniyeden uzun sessizlikler ve duraksamalar algılanır.
*   **Konuşma Hızı (Speech Rate - WPM)**: Toplam kelime sayısı ile ses süresi oranlanarak dakikadaki kelime hızı (Words Per Minute) hesaplanır.

### 📊 Özgüven Skoru Formülü
Adayın genel özgüven performansı, aşağıdaki ağırlıklarla hesaplanan **0-100** arası bir skorla belirlenir:
*   **%30** Göz Teması Oranı
*   **%25** Düşük Stres Düzeyi (100 - Stres Yüzdesi)
*   **%20** İdeal Konuşma Hızı (120-160 WPM arası ideal kabul edilir)
*   **%15** Az Dolgu Kelime Kullanımı (Dolgu kelime başına ceza puanı düşülür)
*   **%10** Akıcılık / Az Duraksama (Uzun duraksama başına ceza puanı düşülür)

---

## ⚡ Hızlı Başlangıç

### 1. Gereksinimler
*   [Node.js](https://nodejs.org/) (v18+)
*   [Python](https://www.python.org/) (v3.10+)
*   [FFmpeg](https://ffmpeg.org/) (Ses işleme ve video çıkarma işlemleri için sisteminizde yüklü ve PATH'e ekli olmalıdır)
*   [Supabase](https://supabase.com/) Hesabı (Veritabanı ve Auth işlemleri için)

### 2. Backend Kurulumu
1. `backend` klasörüne geçin:
   ```bash
   cd backend
   ```
2. Python sanal ortamı oluşturun ve aktif edin:
   ```bash
   python -m venv venv
   # Windows için:
   .\venv\Scripts\activate
   ```
3. Gerekli kütüphaneleri yükleyin:
   ```bash
   pip install -r requirements.txt
   ```
4. `.env` dosyasını oluşturun ve gerekli Supabase URL, API Key ve Gemini API Key bilgilerinizi ekleyin.
5. Sunucuyu başlatın:
   ```bash
   uvicorn app.main:app --reload
   ```

### 3. Dashboard (Web) Kurulumu
1. `dashboard` klasörüne geçin:
   ```bash
   cd ../dashboard
   ```
2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
3. `.env.local` dosyasını oluşturup Supabase bağlantı bilgilerini ekleyin.
4. Geliştirme sunucusunu başlatın:
   ```bash
   npm run dev
   ```

### 4. Mobil Uygulama Kurulumu
1. `mobile` klasörüne geçin:
   ```bash
   cd ../mobile
   ```
2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
3. Uygulamayı başlatın:
   ```bash
   npx expo start
   ```

---

## 📦 Veritabanı Şeması
Platform, analiz sonuçlarını Supabase üzerindeki `interview_analytics` tablosunda saklar. Tablo yapısı şunları içerir:
*   `interview_id`: Benzersiz mülakat ID'si (UUID)
*   `confidence_pct`: Genel özgüven yüzdesi
*   `eye_contact_pct`: Göz teması yüzdesi
*   `pause_count`: Toplam uzun duraksama sayısı
*   `filler_word_count`: Toplam dolgu kelime sayısı
*   `filler_words_detail`: Hangi dolgu kelimesinin kaç kez kullanıldığının detayı (JSON)
*   `speech_rate_wpm`: Konuşma hızı (WPM)
*   `dominant_emotion`: Baskın duygu durumu
*   `emotion_distribution`: Tüm duyguların yüzdesel dağılımı (JSON)
*   `transcript`: Whisper tarafından çıkarılan Türkçe transkripsiyon metni
*   `analysis_status`: Analiz durumu (`processing`, `completed`, `failed`)
