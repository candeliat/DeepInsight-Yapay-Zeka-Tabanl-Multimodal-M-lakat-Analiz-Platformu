# DeepInsight Dashboard (Web Arayüzü)

Bu dizin, DeepInsight platformunun yöneticiler ve adaylar için tasarlanmış **Next.js** tabanlı web arayüzünü içerir. Arayüz; kullanıcı yetkilendirmesi, mülakat listeleme ve yapay zeka analiz sonuçlarının grafiksel raporlanması gibi temel özellikleri sağlar.

---

## 🚀 Başlangıç

Geliştirme sunucusunu çalıştırmak için aşağıdaki adımları takip edin:

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. Geliştirme sunucusunu başlatın:
   ```bash
   npm run dev
   # veya
   yarn dev
   # veya
   pnpm dev
   ```

3. Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresini açarak uygulamayı görüntüleyin.

---

## 🛠️ Kullanılan Teknolojiler

*   **Framework**: [Next.js](https://nextjs.org/) (App Router & TypeScript)
*   **Stil (CSS)**: Vanilla CSS / TailwindCSS
*   **Durum Yönetimi (State Management)**: [Zustand](https://github.com/pmndrs/zustand) (Özellikle kullanıcı oturum yönetimi için `useAuthStore.ts`)
*   **API & Veritabanı**: Supabase JS Client (`@supabase/supabase-js`)
*   **İkon Kütüphanesi**: `lucide-react`

---

## 📂 Klasör Yapısı

*   `src/app/(auth)`: Giriş (`/login`) ve Kayıt Olma (`/register`) sayfaları ile ortak yetkilendirme layout şablonu.
*   `src/app/(dashboard)`: Mülakat listesi (`/interviews`), mülakat detay analizi (`/interviews/[id]`), ana dashboard ekranı (`/dashboard`), profil sayfası (`/profile`) ve sohbet simülasyonu arayüzü (`/chat`).
*   `src/components/ui`: Ortak kullanılan arayüz elemanları (Sidebar, Topbar, Button, Card, Badge vb.).
*   `src/lib`: API bağlantı ayarları ve yardımcı fonksiyonlar (`utils.ts`, `api.ts`).
*   `src/services`: Mülakat ve sohbet verilerini işleyen servis katmanları (`chatService.ts`).
*   `src/store`: Global state tanımları (`useAuthStore.ts`).

---

## 🔧 Kullanılabilir Komutlar

*   `npm run dev` - Geliştirme sunucusunu yerel ortamda başlatır.
*   `npm run build` - Vercel veya diğer sunucularda canlıya almak için Next.js production derlemesini oluşturur.
*   `npm run start` - Derlenmiş production uygulamasını çalıştırır.
*   `npm run lint` - Kod standartlarını ve TypeScript hatalarını kontrol eder.
