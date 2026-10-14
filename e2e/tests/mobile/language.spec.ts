import { expect, test } from '../../fixtures/api';

// İngilizce mülakat modu (mobil): hazırlan ekranında dil, başlatma ve ses çözümleme isteklerinde dil.

const EN_QUESTION = 'Hello! Could you explain the difference between props and state in React?';

test('English seçilince mülakat "en" ile başlar; sesli cevap İngilizce çözümlenir', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-en', first_message: EN_QUESTION } });
  api.on('POST', '/api/v1/interview/transcribe', { json: { text: 'Props come from the parent.' } });
  await page.goto('/prepare');

  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByText('Sorular İngilizce sorulur', { exact: false })).toBeVisible();
  await page.getByText('Yazılı', { exact: true }).click();
  await page.getByText('Başla', { exact: true }).click();
  await expect(page.getByText(EN_QUESTION)).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.language).toBe('en');

  await page.getByRole('button', { name: 'Sesle yanıtla' }).click();
  await expect(page.getByPlaceholder('Dinleniyor...')).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Kaydı durdur' }).click();
  await expect(page.getByPlaceholder('Cevabınızı buraya İngilizce yazın...')).toHaveValue('Props come from the parent.');
  const body = String(api.callsTo('POST', '/api/v1/interview/transcribe')[0].body);
  expect(body).toMatch(/name="language"\r?\n\r?\n\s*en/);
});

test('varsayılan dil Türkçe', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-tr', first_message: 'Merhaba!' } });
  await page.goto('/prepare');
  await page.getByText('Yazılı', { exact: true }).click();
  await page.getByText('Başla', { exact: true }).click();
  await expect(page.getByText('Merhaba!')).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.language).toBe('tr');
});
