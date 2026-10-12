import { expect, test } from '../../fixtures/api';
import { CV_ID } from '../../fixtures/data';

// CV Analizi: açık rıza, yükleme + otomatik analiz, dosya doğrulaması, silme ve rızayı geri çekme.

const pdf = (name: string, size = 2_000) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(size, 0x20)]),
});

test('rıza verilmeden yükleme alanı yok; rıza verilince açılır', async ({ authedPage: page, api }) => {
  await page.goto('/cv');
  await expect(page.getByText('Kişisel verilerin işlenmesi için açık rıza')).toBeVisible();
  await expect(page.getByText('CV yükle', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Okudum, kabul ediyorum' }).click();
  await expect(page.getByText('CV yükle', { exact: true })).toBeVisible();
  await expect(page.getByText('Henüz CV yüklemediniz.')).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/cv/consent')).toHaveLength(1);
});

test('PDF yüklenince analiz otomatik başlar; skor, kontroller, öneriler ve profil gösterilir', async ({ authedPage: page, api }) => {
  api.career.cvConsent = true;
  await page.goto('/cv');
  await page.getByTestId('cv-file-input').setInputFiles(pdf('Özgeçmiş_Ece.pdf'));

  await expect(page.getByRole('heading', { name: 'ATS Uyumluluk Skoru' })).toBeVisible();
  await expect(page.getByLabel('ATS uyumluluk skoru 78 / 100')).toBeVisible();
  await expect(page.getByText('Özgeçmiş_Ece.pdf')).toBeVisible();
  for (const label of ['Makine tarafından okunabilir metin', 'Standart bölüm başlıkları', 'İletişim bilgisi']) {
    await expect(page.getByText(label)).toBeVisible();
  }
  await expect(page.getByText('Telefon numaranızı ekleyin.')).toBeVisible();
  await expect(page.getByText('Deneyim maddelerini ölçülebilir sonuçlarla yazın.')).toBeVisible();
  await expect(page.getByText('ORTA · ~3 yıl deneyim')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bu CV ile mülakat yap' })).toHaveAttribute('href', /\/chat\/text\?cv=cv-2$/);

  expect(api.callsTo('POST', '/api/v1/cv')).toHaveLength(1);
  expect(api.callsTo('POST', '/api/v1/cv/cv-2/analyze')).toHaveLength(1);
});

test('desteklenmeyen tür ve 10 MB üstü dosya sunucuya gönderilmeden reddedilir', async ({ authedPage: page, api }) => {
  api.career.cvConsent = true;
  await page.goto('/cv');
  const input = page.getByTestId('cv-file-input');

  await input.setInputFiles({ name: 'notlar.txt', mimeType: 'text/plain', buffer: Buffer.from('merhaba') });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Desteklenmeyen dosya türü');

  await input.setInputFiles(pdf('buyuk.pdf', 10 * 1024 * 1024 + 1));
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Dosya çok büyük (en fazla 10 MB).');
  expect(api.callsTo('POST', '/api/v1/cv')).toHaveLength(0);
});

test('CV sınırı aşılınca sunucunun mesajı gösterilir', async ({ authedPage: page, api }) => {
  api.career.cvConsent = true;
  api.on('POST', '/api/v1/cv', { status: 409, json: { detail: 'En fazla 5 CV saklayabilirsiniz. Önce birini silin.' } });
  await page.goto('/cv');
  await page.getByTestId('cv-file-input').setInputFiles(pdf('altinci.pdf'));
  await expect(page.getByRole('main').getByRole('alert')).toContainText('En fazla 5 CV saklayabilirsiniz.');
});

test.describe('kayıtlı CV', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('son analiz açılışta gösterilir; yeniden analiz edilebilir', async ({ authedPage: page, api }) => {
    await page.goto('/cv');
    await expect(page.getByLabel('ATS uyumluluk skoru 78 / 100')).toBeVisible();
    await page.getByRole('button', { name: 'Yeniden analiz et' }).click();
    await expect.poll(() => api.callsTo('POST', `/api/v1/cv/${CV_ID}/analyze`).length).toBe(1);
  });

  test('silme onay ister; Vazgeç korur, onaylanınca liste boşalır', async ({ authedPage: page, api }) => {
    await page.goto('/cv');
    await page.getByRole('button', { name: 'Ece_Deneme_CV.pdf dosyasını sil' }).click();
    await expect(page.getByText('Kalıcı olarak silinsin mi?')).toBeVisible();
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    expect(api.callsTo('DELETE', `/api/v1/cv/${CV_ID}`)).toHaveLength(0);

    await page.getByRole('button', { name: 'Ece_Deneme_CV.pdf dosyasını sil' }).click();
    await page.getByRole('button', { name: 'Evet, sil' }).click();
    await expect(page.getByText('Henüz CV yüklemediniz.')).toBeVisible();
    await expect(page.getByText('Analiz için soldan bir CV yükleyin veya seçin.')).toBeVisible();
  });

  test('rızayı geri çekmek onay ister ve tüm CV’leri siler', async ({ authedPage: page, api }) => {
    await page.goto('/cv');
    await page.getByRole('button', { name: 'Rızamı geri çek ve tüm CV’lerimi sil'.replace('’', "'") }).click();
    await expect(page.getByText('yüklediğiniz tüm CV')).toBeVisible();
    await page.getByRole('button', { name: 'Evet, hepsini sil' }).click();
    await expect(page.getByText('Kişisel verilerin işlenmesi için açık rıza')).toBeVisible();
    expect(api.callsTo('DELETE', '/api/v1/cv/consent')).toHaveLength(1);
  });
});
