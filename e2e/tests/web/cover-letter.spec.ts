import { expect, test } from '../../fixtures/api';
import { CV_ID, JOB_ID } from '../../fixtures/data';

// Ön yazı: ilan + CV seçiliyken taslak oluşturma, uyarılar, düzenleme ve kopyalama.

test.describe('ön yazı', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('seçilen dil/ton/not gönderilir; taslak düzenlenebilir ve uyarı gösterilir', async ({ authedPage: page, api, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/jobs');
    const panel = page.getByRole('region', { name: 'Ön yazı (motivasyon mektubu)' });
    await panel.getByRole('radio', { name: 'English' }).click();
    await panel.getByRole('radio', { name: 'Samimi' }).click();
    await panel.getByLabel('Öne çıkarmak istediğiniz nokta').fill('Bitirme projemi vurgula');
    await panel.getByRole('button', { name: 'Ön yazı oluştur' }).click();

    await expect(panel.getByLabel('Konu')).toHaveValue('Application for Frontend Developer');
    const body = panel.getByLabel('Metin');
    await expect(body).toHaveValue(/^Dear Hiring Team,/);
    await expect(panel.getByRole('status')).toContainText("CV'nizde geçmeyen sayılar var: 40");
    await expect(panel).toContainText('Öne çıkarılan beceriler: React, TypeScript');
    expect(api.callsTo('POST', `/api/v1/jobs/${JOB_ID}/cover-letter`)[0].body).toEqual({
      cv_id: CV_ID, language: 'en', tone: 'samimi', note: 'Bitirme projemi vurgula',
    });

    await body.fill('Dear Hiring Team,\n\nEdited by me.');
    await panel.getByRole('button', { name: 'Kopyala' }).click();
    await expect(panel.getByRole('button', { name: 'Kopyalandı' })).toBeVisible();
    // Windows panosu satır sonlarını CRLF'ye çevirir.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(copied).toBe('Application for Frontend Developer\n\nDear Hiring Team,\n\nEdited by me.');
    await expect(panel.getByRole('button', { name: 'Yeniden oluştur' })).toBeVisible();
  });

  test('sunucu hatası panelde gösterilir', async ({ authedPage: page, api }) => {
    api.on('POST', `/api/v1/jobs/${JOB_ID}/cover-letter`, { status: 503, json: { detail: 'Ön yazı şu an hazırlanamadı. Biraz sonra tekrar deneyin.' } });
    await page.goto('/jobs');
    const panel = page.getByRole('region', { name: 'Ön yazı (motivasyon mektubu)' });
    await panel.getByRole('button', { name: 'Ön yazı oluştur' }).click();
    await expect(panel.getByRole('alert')).toContainText('Ön yazı şu an hazırlanamadı');
  });
});
