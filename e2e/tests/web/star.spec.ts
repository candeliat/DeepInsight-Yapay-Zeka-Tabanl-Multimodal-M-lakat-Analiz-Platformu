import { expect, test } from '../../fixtures/api';

// Davranışsal (STAR) mülakat: kurulumda seçenek, her cevaptan sonra koçluk notu, sonuçta özet.

const STREAM = '/api/v1/interview/chat/stream';
const QUESTION = 'Bana bir ekip arkadaşınla anlaşmazlık yaşadığın bir zamanı anlatır mısın?';
const NEXT = 'Peki, bir hatanı fark edip düzelttiğin bir durumu anlatır mısın?';

const weakStar = {
  components: { situation: true, task: true, action: false, result: true },
  score: 65, voice: 'biz', quantified_result: false, word_count: 34,
  tips: ["Senin attığın adımları 'yaptım, önerdim, düzelttim' gibi ben-diliyle sırala; cevabın en uzun kısmı bu olmalı.",
    'Sonucu ölçülebilir yap: süre, yüzde, kullanıcı sayısı gibi bir rakam ekle.'],
};
const fullStar = {
  components: { situation: true, task: true, action: true, result: true },
  score: 100, voice: 'ben', quantified_result: true, word_count: 80, tips: [],
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

test('STAR seçeneği konuyu ayarlar; her cevaba koçluk notu gelir; sonuçta STAR özeti ve "STAR Yapısı" puanı', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-star', first_message: QUESTION } });
  await page.goto('/chat/text');

  const chip = page.getByRole('button', { name: 'Davranışsal (STAR) mülakat' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('koçluk notu alırsınız', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Mülakata Başla' }).click();
  await expect(page.getByText(QUESTION)).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body.topic).toBe('Davranışsal mülakat (STAR)');

  const box = page.getByPlaceholder('Cevabınızı buraya yazın...');
  api.on('POST', STREAM, {
    contentType: 'text/event-stream',
    body: sse([['star', weakStar], ['chunk', NEXT], ['done', { interview_complete: false, evaluation: null }]]),
  });
  await box.fill('Bir projede ekip olarak anlaşamadık, toplantı yaptık ve sonunda uzlaştık.');
  await page.getByRole('button', { name: 'Cevabı gönder' }).click();
  await expect(page.getByText(NEXT)).toBeVisible();

  const coaching = page.getByLabel('STAR koçluğu');
  await expect(coaching).toHaveCount(1);
  await expect(coaching).toContainText('A · Eylem eksik');
  await expect(coaching).toContainText('ben-diliyle');
  await expect(coaching).toContainText('rakam ekle');

  api.on('POST', STREAM, {
    contentType: 'text/event-stream',
    body: sse([
      ['star', fullStar],
      ['chunk', 'Mülakat tamamlandı.'],
      ['done', { interview_complete: true, evaluation: { technical_score: 72, confidence_score: 70, vocabulary_score: 68, feedback: 'Eylem kısmını ben diliyle anlatın.' } }],
    ]),
  });
  await box.fill('Geçen yıl stajımda hatayı buldum, düzelttim ve hata oranı yüzde 90 azaldı.');
  await page.getByRole('button', { name: 'Cevabı gönder' }).click();

  await expect(page.getByText('Değerlendirmeniz hazır')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'STAR Yapısı', exact: true })).toBeVisible();
  const summary = page.getByLabel('STAR özeti');
  await expect(summary).toContainText('2 cevabın ortalama STAR kapsamı');
  await expect(summary).toContainText('83/100');
  await expect(summary).toContainText('En sık eksik kalan: Eylem');
});

test('teknik mülakatta STAR seçeneği seçili değildir ve koçluk gösterilmez', async ({ authedPage: page }) => {
  await page.goto('/chat/text');
  await expect(page.getByRole('button', { name: 'Davranışsal (STAR) mülakat' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('koçluk notu alırsınız', { exact: false })).toHaveCount(0);
});
