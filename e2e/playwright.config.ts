import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * DeepInsight uçtan uca testleri.
 *
 * Backend (FastAPI, :8123) testlerde TAKLİT EDİLİR (fixtures/api.ts): gerçek hesap,
 * şifre, LLM çağrısı ya da veritabanı gerekmez; testler her çalıştırmada aynı sonucu verir.
 * Yalnızca ön yüz geliştirme sunucuları gerekir (yoksa Playwright kendisi başlatır):
 *   web    → dashboard, http://localhost:3002
 *   mobile → Expo web,  http://localhost:8081 (telefon görünümü)
 *
 * Tarayıcı indirilmez; kurulu Chrome kullanılır (channel: 'chrome').
 */

// Windows geliştirme makinesinde C: diski dolu: geçici dosyalar (Chrome profilleri vb.) repo içinde, D:'de
// tutulur. Linux/CI'da yapılmaz: Chrome'un Unix soket yolu 108 karakteri aşar ve tarayıcı açılmaz.
if (process.platform === 'win32') {
  const TMP = path.join(__dirname, '.tmp');
  fs.mkdirSync(TMP, { recursive: true });
  process.env.TMP = process.env.TEMP = TMP;
}

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3002';
const MOBILE_URL = process.env.E2E_MOBILE_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: './tests',
  outputDir: './.out/results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Geliştirme sunucuları ilk derlemede yavaş; aynı anda çok sayfa açmak zaman aşımı yaratır.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: './.out/report', open: 'never' }]],
  use: {
    channel: 'chrome',
    locale: 'tr-TR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Görüntülü mülakat: sahte kamera/mikrofon, izin penceresi otomatik onaylanır.
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'web',
      testDir: './tests/web',
      use: { baseURL: WEB_URL, viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'mobile',
      testDir: './tests/mobile',
      // Pixel 7 ölçüleri, Chromium (WebKit indirilmez).
      use: { ...devices['Pixel 7'], channel: 'chrome', baseURL: MOBILE_URL },
    },
  ],
  webServer: [
    {
      command: 'npx next dev -p 3002',
      cwd: path.join(__dirname, '..', 'dashboard'),
      url: `${WEB_URL}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npx expo start --web --port 8081',
      cwd: path.join(__dirname, '..', 'mobile'),
      url: MOBILE_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
