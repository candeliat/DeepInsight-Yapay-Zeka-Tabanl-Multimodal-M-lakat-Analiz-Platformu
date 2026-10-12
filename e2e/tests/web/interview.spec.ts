import { expect, test } from '../../fixtures/api';
import { FIRST_QUESTION, NEXT_QUESTION, ONGOING_ID, sseBody } from '../../fixtures/data';

const STREAM = '/api/v1/interview/chat/stream';
const ANSWER = 'Küçük uygulamada Context yeterli; sık güncellenen durumda Zustand seçerim.';

test.describe('yazılı mülakat (devam)', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto(`/chat/text?resume=${ONGOING_ID}`);
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
  });

  test('gönderim başarısız olursa cevap kutuda kalır, soru kaybolmaz; tekrar gönderilebilir', async ({ authedPage: page, api }) => {
    api.on('POST', STREAM, 'abort');
    const box = page.getByPlaceholder('Cevabınızı buraya yazın...');
    await box.fill(ANSWER);
    await page.getByRole('button', { name: 'Cevabı gönder' }).click();

    await expect(page.getByRole('main').getByRole('alert')).toContainText('cevabınız kutuda duruyor');
    await expect(box).toHaveValue(ANSWER);
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();

    api.on('POST', STREAM, { body: sseBody(NEXT_QUESTION), contentType: 'text/event-stream' });
    await page.getByRole('button', { name: 'Cevabı gönder' }).click();
    await expect(page.getByText(NEXT_QUESTION)).toBeVisible();
    await expect(box).toHaveValue('');
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    expect(api.callsTo('POST', STREAM).at(-1)!.body).toEqual({ interview_id: ONGOING_ID, message: ANSWER });
  });

  test('Mülakatı Bitir onay ister; Vazgeç ile mülakat sürer', async ({ authedPage: page, api }) => {
    await page.getByRole('button', { name: 'Mülakatı Bitir' }).click();
    await expect(page.getByRole('button', { name: 'Bitir', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.getByRole('button', { name: 'Mülakatı Bitir' })).toBeVisible();
    expect(api.callsTo('POST', `/api/v1/interview/${ONGOING_ID}/finish`)).toHaveLength(0);
  });
});

test('yazılı mülakat: hedef pozisyon rol alanını önceden doldurur', async ({ authedPage: page }) => {
  await page.goto('/chat/text');
  await expect(page.getByRole('main').locator('input').first()).toHaveValue('Frontend Geliştirici');
});

test.describe('görüntülü mülakat', () => {
  test('onam kutusu işaretlenmeden başlatılamaz', async ({ authedPage: page }) => {
    await page.goto('/chat');
    const start = page.getByRole('button', { name: 'Görüntülü mülakata başla' });
    await expect(start).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(start).toBeEnabled();
  });

  test('sıra: onam kaydı → kamera izni → mülakat başlatma; izin beklenirken mülakat oluşturulmaz', async ({ authedPage: page, api }) => {
    // Kamera izni penceresini taklit et: getUserMedia, test izin verene kadar bekler.
    await page.addInitScript(() => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      (window as any).__grantCamera = null;
      navigator.mediaDevices.getUserMedia = (c) =>
        new Promise((resolve, reject) => {
          (window as any).__grantCamera = () => real(c).then(resolve, reject);
        });
    });
    api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });

    await page.goto('/chat');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Görüntülü mülakata başla' }).click();

    await expect(page.getByText('kamera/mikrofon izin penceresini onaylayın')).toBeVisible();
    expect(api.callsTo('PUT', '/api/v1/account/consents/video_analysis')[0].body).toEqual({ granted: true });
    expect(api.callsTo('POST', '/api/v1/interview/start')).toHaveLength(0);

    await page.evaluate(() => (window as any).__grantCamera());
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
    await expect(page.getByText('Kaydediliyor')).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/interview/start')).toHaveLength(1);
  });

  test('kamera izni reddedilirse mülakat analizsiz sürer ve "Kayıt yok" gösterilir', async ({ authedPage: page, api }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    api.state.consentGranted = true;
    api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });

    await page.goto('/chat');
    await page.getByRole('button', { name: 'Görüntülü mülakata başla' }).click();
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
    await expect(page.getByText('Kayıt yok')).toBeVisible();
    await expect(page.getByText('Kamera/mikrofon erişimi verilmedi')).toBeVisible();
  });
});
