import { expect, test } from '../../fixtures/api';

// Mobil davranışsal (STAR) mülakat: hazırlan ekranında seçenek, odada son cevabın koçluk notu, sonuçta özet.

const STREAM = '/api/v1/interview/chat/stream';
const QUESTION = 'Bana bir ekip arkadaşınla anlaşmazlık yaşadığın bir zamanı anlatır mısın?';
const NEXT = 'Peki, bir hatanı fark edip düzelttiğin bir durumu anlatır mısın?';
const TOPIC = 'Davranışsal mülakat (STAR)';

const weakStar = {
  components: { situation: true, task: true, action: false, result: true },
  score: 65, voice: 'biz', quantified_result: false, word_count: 34,
  tips: ['Sonucu ölçülebilir yap: süre, yüzde, kullanıcı sayısı gibi bir rakam ekle.'],
};
const fullStar = {
  components: { situation: true, task: true, action: true, result: true },
  score: 100, voice: 'ben', quantified_result: true, word_count: 80, tips: [],
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

test('STAR seçeneği konuyu ayarlar; odada son cevabın koçluk notu yeni sorunun altında görünür', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-star', first_message: QUESTION } });
  await page.goto('/prepare');

  await page.getByRole('button', { name: 'Davranışsal (STAR) mülakat' }).click();
  await expect(page.getByPlaceholder('Örn: React ve Modern Web Geliştirme')).toHaveValue(TOPIC);
  await expect(page.getByText('koçluk notu alırsınız', { exact: false })).toBeVisible();
  await page.getByText('Yazılı', { exact: true }).click();
  await page.getByText('Başla', { exact: true }).click();
  await expect(page.getByText(QUESTION)).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.topic).toBe(TOPIC);

  api.on('POST', STREAM, {
    contentType: 'text/event-stream',
    body: sse([['star', weakStar], ['chunk', NEXT], ['done', { interview_complete: false, evaluation: null }]]),
  });
  await page.getByPlaceholder('Cevabınızı buraya yazın...').fill('Ekip olarak anlaşamadık, toplantı yaptık ve uzlaştık.');
  await page.getByRole('button', { name: 'Cevabı gönder' }).click();
  await expect(page.getByText(NEXT)).toBeVisible();
  await expect(page.getByText('Önceki cevabınız için koçluk notu')).toBeVisible();
  await expect(page.getByText('A · Eylem eksik')).toBeVisible();
  await expect(page.getByText('rakam ekle', { exact: false })).toBeVisible();
});

test('sonuç ekranı davranışsal mülakatta "STAR Yapısı" puanı, STAR özeti ve dökümde koçluk notları gösterir', async ({ authedPage: page, api }) => {
  const base = api.state.interviews.find((i) => i.id === 'int-strong')!;
  api.on('GET', '/api/v1/interview/int-strong', {
    json: {
      ...base, topic: TOPIC, feedback: 'Eylem kısmını ben diliyle anlatın.',
      messages: [
        { role: 'model', content: QUESTION },
        { role: 'user', content: 'Ekip olarak anlaştık.', coaching: weakStar },
        { role: 'model', content: NEXT },
        { role: 'user', content: 'Hatayı buldum, düzelttim, hata oranı yüzde 90 azaldı.', coaching: fullStar },
      ],
    },
  });
  await page.goto('/interview-result?id=int-strong');
  await expect(page.getByText('Mülakat tamamlandı')).toBeVisible();
  await expect(page.getByText('STAR Yapısı', { exact: true })).toBeVisible();
  await expect(page.getByText('2 cevabın ortalama STAR kapsamı', { exact: false })).toBeVisible();
  await expect(page.getByText('En sık eksik kalan:', { exact: false })).toContainText('Eylem');

  await page.getByText('Mülakat dökümü').click();
  await expect(page.getByText('A · Eylem eksik')).toBeVisible();
  await expect(page.getByText('Tam bir STAR cevabı', { exact: false })).toBeVisible();
});
