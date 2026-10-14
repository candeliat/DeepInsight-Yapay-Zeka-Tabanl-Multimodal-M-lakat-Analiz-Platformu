import { expect, test } from '../../fixtures/api';

// İngilizce mülakat modu (web): kurulumda dil seçimi, başlatma isteğinde dil, seslendirme dili.

const EN_QUESTION = 'Hello! Could you explain the difference between props and state in React?';

test('yazılı mülakat: English seçilince istek "en" ile gider ve cevap kutusu İngilizce ister', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-en', first_message: EN_QUESTION } });
  await page.goto('/chat/text');

  const tr = page.getByRole('button', { name: 'Türkçe', exact: true });
  const en = page.getByRole('button', { name: 'English', exact: true });
  await expect(tr).toHaveAttribute('aria-pressed', 'true');
  await en.click();
  await expect(en).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Sorular İngilizce sorulur', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Mülakata Başla' }).click();
  await expect(page.getByText(EN_QUESTION)).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.language).toBe('en');
  await expect(page.getByPlaceholder('Cevabınızı buraya İngilizce yazın...')).toBeVisible();
});

test('yazılı mülakat: varsayılan dil Türkçe', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-tr', first_message: 'Merhaba!' } });
  await page.goto('/chat/text');
  await page.getByRole('button', { name: 'Mülakata Başla' }).click();
  await expect(page.getByText('Merhaba!')).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.language).toBe('tr');
});

test('görüntülü mülakat: English seçilince soru İngilizce seslendirilir', async ({ authedPage: page, api }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    (window as any).__spokenLangs = [];
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      (window as any).__spokenLangs.push(u.lang);
      speak(u);
    };
  });
  api.state.consentGranted = true;
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-en-v', first_message: EN_QUESTION } });
  await page.goto('/chat');

  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Görüntülü mülakata başla' }).click();
  await expect(page.getByText('could you explain', { exact: false })).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.language).toBe('en');
  await expect.poll(() => page.evaluate(() => (window as any).__spokenLangs)).toContain('en-US');
});
