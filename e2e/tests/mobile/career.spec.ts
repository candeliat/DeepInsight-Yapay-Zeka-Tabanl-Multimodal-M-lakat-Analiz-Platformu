import { expect, test } from '../../fixtures/api';
import { CV_ID, JOB_ID, ORG_CANDIDATE } from '../../fixtures/data';

// Mobil CV, ilan, kurum ve ödev ekranları. Expo yığını önceki ekranları DOM'da tuttuğu için
// metinler `visible: true` ile görünen öğeye daraltılır.
const shown = (page: import('@playwright/test').Page, text: string | RegExp, exact = false) =>
  page.getByText(text, { exact }).filter({ visible: true });

test.describe('CV', () => {
  test('rıza verilince yükleme açılır; dosya seçilince CV yüklenir ve detayına gidilir', async ({ authedPage: page, api }) => {
    await page.goto('/cv');
    await shown(page, 'Okudum, kabul ediyorum', true).click();
    await expect(shown(page, 'Henüz CV yüklemediniz.')).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/cv/consent')).toHaveLength(1);

    const chooser = page.waitForEvent('filechooser');
    await shown(page, 'Dosya seç', true).click();
    await (await chooser).setFiles({ name: 'Mobil_CV.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') });

    await expect(page).toHaveURL(/\/cv\/cv-2/);
    await expect(shown(page, 'Henüz analiz edilmedi')).toBeVisible();
    await shown(page, 'Analiz et', true).click();
    await expect(page.getByLabel('ATS: 78 / 100').filter({ visible: true })).toBeVisible();
    await expect(shown(page, '→ Telefon numaranızı ekleyin.')).toBeVisible();
  });

  test.describe('kayıtlı CV', () => {
    test.beforeEach(({ api }) => {
      api.seedCareer();
    });

    test('detayda skor, kontroller ve mülakat/ilan bağlantıları', async ({ authedPage: page }) => {
      await page.goto('/cv');
      await shown(page, 'Ece_Deneme_CV.pdf').click();
      await expect(page).toHaveURL(new RegExp(`/cv/${CV_ID}`));
      await expect(page.getByLabel('ATS: 78 / 100').filter({ visible: true })).toBeVisible();
      await expect(shown(page, 'Standart bölüm başlıkları')).toBeVisible();
      await shown(page, 'Bu CV ile mülakat', true).click();
      await expect(page).toHaveURL(new RegExp(`/prepare\\?cv=${CV_ID}`));
      await expect(shown(page, 'CV’nize göre kişiselleştirilecek', false).or(shown(page, "CV'nize göre kişiselleştirilecek"))).toBeVisible();
    });

    test('CV silme onay ister', async ({ authedPage: page, api }) => {
      await page.goto(`/cv/${CV_ID}`);
      await shown(page, "CV'yi sil", true).click();
      await expect(shown(page, 'Bu CV ve analizleri kalıcı olarak silinecek.')).toBeVisible();
      await shown(page, 'Vazgeç', true).click();
      expect(api.callsTo('DELETE', `/api/v1/cv/${CV_ID}`)).toHaveLength(0);
      await shown(page, "CV'yi sil", true).click();
      await shown(page, 'Sil', true).click();
      await expect.poll(() => api.callsTo('DELETE', `/api/v1/cv/${CV_ID}`).length).toBe(1);
    });

    test('rızayı geri çekmek onay ister ve CV’leri siler', async ({ authedPage: page, api }) => {
      await page.goto('/cv');
      await shown(page, 'Rızamı geri çek', true).click();
      await shown(page, 'Geri çek ve sil', true).click();
      await expect(shown(page, 'Okudum, kabul ediyorum', true)).toBeVisible();
      expect(api.callsTo('DELETE', '/api/v1/cv/consent')).toHaveLength(1);
    });
  });
});

test.describe('İlanlar', () => {
  test('kısa metinle kaydedilemez; yeterli metinle ilan oluşturulup detayına gidilir', async ({ authedPage: page, api }) => {
    await page.goto('/jobs');
    await shown(page, 'Yeni ilan ekle', true).click();
    const save = page.getByRole('button', { name: 'Kaydet ve analiz et' }).filter({ visible: true });
    await page.getByLabel('İlan metni').fill('Kısa');
    await expect(save).toBeDisabled();

    await page.getByLabel('İlan metni').fill('React ve TypeScript bilen, birim testi yazabilen bir Frontend Developer arıyoruz. Next.js artı.');
    await page.getByPlaceholder('Pozisyon (ops.)').fill('Frontend Developer');
    await save.click();
    await expect(page).toHaveURL(/\/jobs\/job-2/);
    await expect(shown(page, 'En az 2 yıl', true)).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/jobs')[0].body).toMatchObject({ title: 'Frontend Developer' });
  });

  test.describe('kayıtlı ilan', () => {
    test.beforeEach(({ api }) => {
      api.seedCareer();
    });

    test('CV ile eşleştirme: skor, beceri durumları, açılır yol haritası ve ilana göre mülakat', async ({ authedPage: page, api }) => {
      await page.goto('/jobs');
      await shown(page, 'Frontend Developer').first().click();
      await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_ID}`));
      await expect(page.getByRole('radio', { name: 'Ece_Deneme_CV.pdf' })).toBeChecked(); // aria-checked (ekran okuyucu)

      await shown(page, 'Eşleştir', true).click();
      await expect(page.getByLabel('UYUM: 64 / 100').filter({ visible: true })).toBeVisible();
      await expect(shown(page, 'Metinde geçiyor', true)).toBeVisible();
      await expect(shown(page, 'Eksik', true).first()).toBeVisible();
      await expect(shown(page, 'Öncelik: yüksek', true)).toBeVisible();

      // İlk yol haritası maddesi açık gelir; başlığa dokununca kapanır/açılır ve durumu ekran okuyucuya bildirilir.
      const head = page.locator('[aria-expanded]').filter({ visible: true }).filter({ hasText: 'Öncelik: yüksek' });
      await expect(head).toHaveAttribute('aria-expanded', 'true');
      await expect(shown(page, '1. Jest temellerini öğrenin.')).toBeVisible();
      await head.click();
      await expect(head).toHaveAttribute('aria-expanded', 'false');
      await expect(shown(page, '1. Jest temellerini öğrenin.')).toHaveCount(0);
      await head.click();
      await expect(shown(page, '1. Jest temellerini öğrenin.')).toBeVisible();
      expect(api.callsTo('POST', `/api/v1/jobs/${JOB_ID}/match`)[0].body).toEqual({ cv_id: CV_ID });

      await shown(page, 'Bu ilana göre mülakat', true).click();
      await expect(page).toHaveURL(new RegExp(`/prepare\\?.*job=${JOB_ID}`));
    });

    test('CV yoksa eşleştirme yerine yönlendirme gösterilir', async ({ authedPage: page, api }) => {
      api.career.cvConsent = false;
      await page.goto(`/jobs/${JOB_ID}`);
      await expect(shown(page, 'Eşleştirme için önce bir CV yükleyip analiz edin', false)).toBeVisible();
    });

    test('ilan silme onay ister ve listeye döner', async ({ authedPage: page, api }) => {
      await page.goto(`/jobs/${JOB_ID}`);
      await shown(page, 'İlanı sil', true).click();
      await expect(shown(page, 'İlan ve eşleştirmeleri silinecek.')).toBeVisible();
      await shown(page, 'Sil', true).click();
      await expect.poll(() => api.callsTo('DELETE', `/api/v1/jobs/${JOB_ID}`).length).toBe(1);
    });
  });
});

test.describe('Kurumlarım ve ödevler', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('davet kabul edilir, kodla katılınır, paylaşım anahtarı çalışır', async ({ authedPage: page, api }) => {
    await page.goto('/organizations');
    await expect(shown(page, 'Yeni Akademi')).toBeVisible();
    await shown(page, 'Kabul et', true).click();
    await expect.poll(() => api.callsTo('POST', '/api/v1/organizations/invites/inv-1/accept').length).toBe(1);

    await page.getByLabel('Davet kodu').fill('YANLIS');
    await shown(page, 'Katıl', true).click();
    await expect(shown(page, 'Geçersiz davet kodu')).toBeVisible();
    await page.getByLabel('Davet kodu').fill('KATIL-2026');
    await shown(page, 'Katıl', true).click();
    await expect(shown(page, 'Katılım Akademisi', true)).toBeVisible();

    const share = page.getByRole('switch', { name: 'Örnek Üniversitesi Kariyer Merkezi ile ilerleme paylaşımı' });
    await expect(share).not.toBeChecked();
    await share.click();
    await expect(share).toBeChecked();
    expect(api.callsTo('PUT', `/api/v1/organizations/${ORG_CANDIDATE}/me/sharing`)[0].body).toEqual({ share_progress: true });
    await expect(shown(page, 'Kurum paneli masaüstünde (web) kullanılabilir.')).toBeVisible();
  });

  test('ödevler: yapılacak/tamamlanan, skor yüzdesiz, başla hazırlan ekranını ödevle açar', async ({ authedPage: page }) => {
    await page.goto('/assignments');
    await expect(shown(page, 'React haftalık pratik')).toBeVisible();
    await expect(shown(page, 'Veri yapıları tekrarı')).toBeVisible();
    await expect(shown(page, '82/100', true)).toBeVisible();
    await expect(page.getByText(/%/).filter({ visible: true })).toHaveCount(0);

    await shown(page, 'Başla', true).first().click();
    await expect(page).toHaveURL(/\/prepare\?assignment=as-todo/);
    await expect(page.getByPlaceholder('Örn: Yazılım Mühendisi').filter({ visible: true })).toHaveValue('Frontend Developer');
  });
});
