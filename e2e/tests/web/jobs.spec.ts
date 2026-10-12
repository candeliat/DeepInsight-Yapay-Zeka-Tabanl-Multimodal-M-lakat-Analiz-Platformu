import { expect, test } from '../../fixtures/api';
import { CV_ID, JOB_ID } from '../../fixtures/data';

// İlan Eşleştirme: ilan ekleme doğrulaması, gereksinimler, CV ile eşleştirme sonucu, yol haritası, silme.

const LONG_TEXT =
  'Ekibimize React ve TypeScript bilen bir Frontend Developer arıyoruz. Birim testi yazma deneyimi şart, Next.js bilmek artı.';

test('kısa ilan metni sunucuya gönderilmez; yeterli metin kaydedilip seçilir', async ({ authedPage: page, api }) => {
  await page.goto('/jobs');
  await expect(page.getByText('Henüz ilan eklemediniz.')).toBeVisible();

  await page.getByLabel('İlan metni').fill('Kısa metin');
  await page.getByRole('button', { name: 'İlanı analiz et' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('İlan metni en az 80 karakter olmalı.');
  expect(api.callsTo('POST', '/api/v1/jobs')).toHaveLength(0);

  await page.getByPlaceholder('Pozisyon (opsiyonel)').fill('Frontend Developer');
  await page.getByPlaceholder('Şirket (opsiyonel)').fill('Lumen Yazılım');
  await page.getByLabel('İlan metni').fill(LONG_TEXT);
  await page.getByRole('button', { name: 'İlanı analiz et' }).click();

  await expect(page.getByRole('heading', { name: 'Frontend Developer' })).toBeVisible();
  await expect(page.getByText('3 zorunlu beceri')).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/jobs')[0].body).toEqual({ text: LONG_TEXT, title: 'Frontend Developer', company: 'Lumen Yazılım' });
});

test('CV yoksa eşleştirme yerine CV yükleme yönlendirmesi gösterilir', async ({ authedPage: page, api }) => {
  api.seedCareer();
  api.career.cvConsent = false;
  await page.goto('/jobs');
  await expect(page.getByRole('link', { name: 'bir CV yükleyip analiz edin' })).toHaveAttribute('href', '/cv');
  await expect(page.getByRole('button', { name: 'Eşleştir' })).toHaveCount(0);
});

test.describe('kayıtlı ilan + CV', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('gereksinimler gösterilir; eşleştirme skoru, beceri durumları, yol haritası ve mülakat bağlantısı', async ({ authedPage: page, api }) => {
    await page.goto('/jobs');
    await expect(page.getByText('En az 2 yıl')).toBeVisible();
    await expect(page.getByLabel('CV')).toHaveValue(CV_ID);

    await page.getByRole('button', { name: 'Eşleştir', exact: true }).click();
    await expect(page.getByLabel('İlan uyum skoru 64 / 100')).toBeVisible();
    await expect(page.getByText('React deneyiminiz güçlü; test yazma eksik.')).toBeVisible();
    await expect(page.getByText('CV metninde geçiyor ama beceriler listenizde yok')).toBeVisible();
    await expect(page.getByText('Deneyim yılınız ilanın beklentisini karşılıyor.')).toBeVisible();
    await expect(page.getByText('1. Testing')).toBeVisible();
    await expect(page.getByText('yüksek öncelik')).toBeVisible();
    await expect(page.getByText('~2 hafta')).toBeVisible();
    await expect(page.getByText('Birim testi', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bu ilana göre mülakat yap' })).toHaveAttribute(
      'href',
      `/chat/text?cv=${CV_ID}&job=${JOB_ID}`,
    );
    await expect(page.getByRole('button', { name: 'Yeniden eşleştir' })).toBeVisible();
    expect(api.callsTo('POST', `/api/v1/jobs/${JOB_ID}/match`)[0].body).toEqual({ cv_id: CV_ID });
  });

  test('önceki eşleştirme sayfa açılınca yüklenir', async ({ authedPage: page, api }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: 'Eşleştir', exact: true }).click();
    await expect(page.getByLabel('İlan uyum skoru 64 / 100')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('İlan uyum skoru 64 / 100')).toBeVisible();
    expect(api.callsTo('POST', `/api/v1/jobs/${JOB_ID}/match`)).toHaveLength(1);
  });

  test('eşleştirme hatası satır içinde gösterilir', async ({ authedPage: page, api }) => {
    api.on('POST', /^\/api\/v1\/jobs\/[^/]+\/match$/, { status: 503, json: { detail: 'Yapay zekâ servisine ulaşılamadı.' } });
    await page.goto('/jobs');
    await page.getByRole('button', { name: 'Eşleştir', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Yapay zekâ servisine ulaşılamadı.');
  });

  test('ilan silme onay ister', async ({ authedPage: page, api }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: 'Frontend Developer sil' }).click();
    await expect(page.getByText('Silinsin mi?')).toBeVisible();
    await page.getByRole('button', { name: 'Evet, sil' }).click();
    await expect(page.getByText('Henüz ilan eklemediniz.')).toBeVisible();
    expect(api.callsTo('DELETE', `/api/v1/jobs/${JOB_ID}`)).toHaveLength(1);
  });
});
