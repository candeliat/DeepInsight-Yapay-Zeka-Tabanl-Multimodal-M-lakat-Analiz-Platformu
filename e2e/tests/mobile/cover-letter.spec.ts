import { expect, test } from '../../fixtures/api';
import { CV_ID, JOB_ID } from '../../fixtures/data';

// Mobil ön yazı: ilan detayında taslak oluşturma ve uyarılar.
const shown = (page: import('@playwright/test').Page, text: string | RegExp, exact = false) =>
  page.getByText(text, { exact }).filter({ visible: true });

test('ilan detayında ön yazı oluşturulur; varsayılan Türkçe/resmi, uyarı gösterilir', async ({ authedPage: page, api }) => {
  api.seedCareer();
  await page.goto(`/jobs/${JOB_ID}`);
  await shown(page, 'Ön yazı oluştur', true).click();

  const letter = page.getByLabel('Ön yazı metni').filter({ visible: true });
  await expect(letter).toHaveValue(/^Frontend Developer pozisyonu için başvuru\n\nSayın İşe Alım Ekibi,/);
  await expect(shown(page, /CV'nizde geçmeyen sayılar var: 40/)).toBeVisible();
  await expect(shown(page, 'Yeniden oluştur', true)).toBeVisible();
  expect(api.callsTo('POST', `/api/v1/jobs/${JOB_ID}/cover-letter`)[0].body).toEqual({ cv_id: CV_ID, language: 'tr', tone: 'resmi' });
});
