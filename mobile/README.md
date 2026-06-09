# DeepInsight Mobile (Mobil Uygulama)

Bu dizin, adayların mülakatları gerçekleştirmesi ve sonuçlarını görüntülemesi amacıyla tasarlanmış **Expo** (React Native) mobil uygulamasını içerir. Adaylar bu uygulama üzerinden kendilerine atanan mülakat odasına bağlanarak video ve ses kaydı yaparlar.

---

## 🚀 Başlangıç

Uygulamayı yerel geliştirme ortamınızda çalıştırmak için aşağıdaki adımları uygulayın:

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. Uygulamayı başlatın:
   ```bash
   npx expo start
   ```

Çıkan terminal ekranında/arayüzünde aşağıdaki yöntemlerden biriyle uygulamayı test edebilirsiniz:
*   Fiziksel cihazınızda **Expo Go** uygulamasını (iOS veya Android) indirip karekodu taratarak.
*   **a** tuşuna basarak bir Android Emülatöründe çalıştırarak.
*   **i** tuşuna basarak bir iOS Simülatöründe çalıştırarak (macOS gereklidir).

---

## 🛠️ Kullanılan Teknolojiler ve Yapı

*   **Platform**: [Expo](https://expo.dev) & React Native (TypeScript)
*   **Yönlendirme (Routing)**: Expo Router (Dosya tabanlı yönlendirme - File-based routing)
*   **Durum Yönetimi (State)**: [Zustand](https://github.com/pmndrs/zustand) (`userStore.ts`, `interviewStore.ts`)
*   **Kamera & Ses**: `expo-camera` / `expo-av`
*   **Kalıcı Depolama (Storage)**: AsyncStorage / SecureStore (`storage.ts`)
*   **HTTP İstemci**: Axios (`src/config/api.ts`)

---

## 📂 Klasör Yapısı

*   `app/index.tsx`: Uygulamanın giriş kapısı (oturum durumuna göre yönlendirme yapar).
*   `app/(auth)`: Giriş (`login.tsx`) ve Kayıt Olma (`register.tsx`) ekranları.
*   `app/(tabs)`: Uygulamanın ana sekmeleri:
    *   `home.tsx`: Adayın yaklaşan mülakatları ve geçmiş mülakat özetleri.
    *   `prepare.tsx`: Mülakat öncesi ipuçları, sistem kontrolleri (kamera ve mikrofon yetkileri).
    *   `profile.tsx`: Kullanıcı profili ayarları ve çıkış yapma.
    *   `reports.tsx`: Adayın geçmiş mülakatlarına ait detaylı performans raporları.
*   `app/interview-room.tsx`: **Mülakat Odası**. Adayın karşısına gelen soruları okuyup video kaydı başlattığı, süre takibi yaptığı ve kaydı sisteme yüklediği ana ekran.
*   `app/interview-result.tsx`: Mülakat bittiğinde adaya gösterilen özet ekran.
*   `src/components`: Ortak buton, girdi alanları ve kart bileşenleri (`CustomButton.tsx`, `CustomInput.tsx`, `CategoryCard.tsx`).
*   `src/config`: Backend API URL ve bağlantı ayarları (`api.ts`).
*   `src/store`: Kullanıcı ve mülakat bilgilerini tutan global state'ler.

---

## 🔧 Kullanılabilir Komutlar

*   `npx expo start` - Expo geliştirme sunucusunu ve Metro bundler'ı başlatır.
*   `npx expo start --android` - Uygulamayı doğrudan Android emülatöründe açar.
*   `npx expo start --ios` - Uygulamayı doğrudan iOS simülatöründe açar.
*   `npm run reset-project` - Örnek şablon kodlarını temizleyerek sıfır bir projeden başlamanızı sağlar (opsiyonel).
