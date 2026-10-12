import { expect, test } from '../../fixtures/api';
import { FIRST_QUESTION, NEXT_QUESTION, ONGOING_ID, sseBody } from '../../fixtures/data';

const STREAM = '/api/v1/interview/chat/stream';
const ANSWER = 'Küçük uygulamada Context yeterli; sık güncellenen durumda Zustand seçerim.';

test.describe('hazırlan', () => {
  test('hedef pozisyon rolü doldurur; onam yokken Başla engellenir ve alt çubuk nedenini söyler', async ({ authedPage: page, api }) => {
    await page.goto('/prepare');
    await expect(page.getByPlaceholder('Örn: Yazılım Mühendisi')).toHaveValue('Frontend Geliştirici');

    const bar = page.getByText('Önce video analizi onamını verin ya da Yazılı modu seçin.');
    await expect(bar).toBeVisible();
    await page.getByText('Başla', { exact: true }).click();
    await expect(page.getByText('Görüntülü mülakat için önce video analizi onamını verin', { exact: false })).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/interview/start')).toHaveLength(0);

    await page.getByText('Yazılı', { exact: true }).click();
    await expect(page.getByText('Oturumunuz hazır.')).toBeVisible();
  });

  test('onam verilince görüntülü mod hazır olur', async ({ authedPage: page, api }) => {
    await page.goto('/prepare');
    await page.getByText('Okudum, onaylıyorum').click();
    await expect(page.getByText('Oturumunuz hazır.')).toBeVisible();
    expect(api.callsTo('PUT', '/api/v1/account/consents/video_analysis')[0].body).toEqual({ granted: true });
  });

  test('yazılı mülakat başlatılır ve mülakat odası kayıtsız modda açılır', async ({ authedPage: page, api }) => {
    api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });
    await page.goto('/prepare');
    await page.getByText('Yazılı', { exact: true }).click();
    await page.getByText('Başla', { exact: true }).click();
    await expect(page).toHaveURL(/\/interview-room/);
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
    await expect(page.getByText('Yazılı mülakat · kayıt yapılmıyor')).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/interview/start')[0].body).toMatchObject({ role: 'Frontend Geliştirici' });
  });
});

test.describe('yarıda kalan mülakat', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Ana sayfa bandı → sonuç ekranı → kaldığım yerden devam → mülakat odası
    await page.goto('/home');
    await expect(page.getByText('Yarıda kalan bir mülakatın var')).toBeVisible();
    await page.getByText('Devam et', { exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(new RegExp(`/interview-result\\?id=${ONGOING_ID}`));
    await page.getByText('Kaldığım yerden devam et').click();
    await expect(page).toHaveURL(/\/interview-room/);
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
  });

  test('gönderim başarısız olursa soru ve cevap kaybolmaz; tekrar gönderilebilir', async ({ authedPage: page, api }) => {
    api.on('POST', STREAM, 'abort');
    const box = page.getByPlaceholder('Cevabınızı buraya yazın...');
    await box.fill(ANSWER);
    await page.getByRole('button', { name: 'Cevabı gönder' }).click();

    await expect(page.getByText('Yanıt gönderilemedi.', { exact: false })).toBeVisible();
    await expect(box).toHaveValue(ANSWER);
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();

    api.on('POST', STREAM, { body: sseBody(NEXT_QUESTION), contentType: 'text/event-stream' });
    await page.getByRole('button', { name: 'Cevabı gönder' }).click();
    await expect(page.getByText(NEXT_QUESTION)).toBeVisible();
    await expect(page.getByText('Yanıt gönderilemedi.', { exact: false })).toHaveCount(0);
  });

  test('Mülakatı Bitir → "Şimdilik çık" ana sayfaya döner, mülakat bitirilmez', async ({ authedPage: page, api }) => {
    await page.getByText('Mülakatı Bitir', { exact: true }).click();
    await page.getByText('Şimdilik çık', { exact: false }).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText('Yarıda kalan bir mülakatın var').filter({ visible: true })).toHaveCount(1);
    expect(api.callsTo('POST', `/api/v1/interview/${ONGOING_ID}/finish`)).toHaveLength(0);
  });
});

test('sonuç ekranından yarıda kalan mülakat silinir', async ({ authedPage: page, api }) => {
  await page.goto(`/interview-result?id=${ONGOING_ID}`);
  await page.getByText('Mülakatı sil').click();
  await page.getByText(/^(Sil|Evet, sil|Kalıcı olarak sil)$/).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/reports/);
  expect(api.callsTo('DELETE', `/api/v1/interview/${ONGOING_ID}`)).toHaveLength(1);
});
