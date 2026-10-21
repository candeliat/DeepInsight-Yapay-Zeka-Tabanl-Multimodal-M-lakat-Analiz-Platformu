import { expect, test } from '../../fixtures/api';
import { CV_ID, EVALUATION_FAILED, FINISH_OK, FIRST_QUESTION, NEXT_QUESTION, JOB_ID, ONGOING_ID, SSE_EVALUATION_FAILED, sseBody } from '../../fixtures/data';

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

  test('değerlendirme yapılamazsa 0 puan gösterilmez; tekrar dene ile sonuç alınır', async ({ authedPage: page, api }) => {
    const finish = `/api/v1/interview/${ONGOING_ID}/finish`;
    api.on('POST', STREAM, { body: SSE_EVALUATION_FAILED, contentType: 'text/event-stream' });
    api.on('POST', finish, { status: 503, json: { detail: EVALUATION_FAILED } });
    const box = page.getByPlaceholder('Cevabınızı buraya yazın...');
    await box.fill(ANSWER);
    await page.getByRole('button', { name: 'Cevabı gönder' }).click();

    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText('Değerlendirme şu an yapılamadı');
    await expect(box).toHaveValue(''); // cevap kaydedildi, kutuya geri konmaz

    await alert.getByRole('button', { name: 'Değerlendirmeyi tekrar dene' }).click();
    await expect(alert).toContainText('Değerlendirme şu an yapılamadı'); // ikinci deneme de başarısız
    api.on('POST', finish, { json: FINISH_OK });
    await alert.getByRole('button', { name: 'Değerlendirmeyi tekrar dene' }).click();
    await expect(page.getByText('Değerlendirmeniz hazır')).toBeVisible();
    await expect(page.getByText('72/100')).toBeVisible();
    expect(api.callsTo('POST', finish)).toHaveLength(2);
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
  test('CV ve ilan seçilince rol/konu önerilir, bant gösterilir; mülakat cv_id ve job_id ile başlar', async ({ authedPage: page, api }) => {
    api.seedCareer();
    api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });
    await page.goto('/chat');

    await page.getByLabel("CV'ye göre kişiselleştir").selectOption(CV_ID);
    await page.getByLabel('İlana göre mülakat').selectOption(JOB_ID);
    await expect(page.getByText('Bu ilana göre mülakat')).toBeVisible();
    await expect(page.getByText("CV'nize göre kişiselleştirilecek")).toBeVisible();
    await expect(page.getByLabel('Hedef Rol / Pozisyon')).toHaveValue('Frontend Developer');

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Görüntülü mülakata başla' }).click();
    await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
    const body = api.callsTo('POST', '/api/v1/interview/start')[0].body as Record<string, unknown>;
    expect([body.cv_id, body.job_id]).toEqual([CV_ID, JOB_ID]);
  });

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

  test('bitince kayıt yüklenir; analiz sıradaysa önündeki iş sayısı gösterilir, bitince sonuçlar açılır', async ({ authedPage: page, api }) => {
    api.state.consentGranted = true;
    api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });
    api.on('POST', '/api/v1/interview/int-new/finish', {
      json: { response: '', interview_complete: true,
        evaluation: { technical_score: 74, confidence_score: 60, vocabulary_score: 70, feedback: 'Hook kurallarını iyi açıkladınız.' } },
    });
    api.on('POST', '/api/v1/analytics/analyze/int-new', { json: { interview_id: 'int-new', status: 'queued', queue_position: 2 } });
    const statuses = [
      { analysis_status: 'queued', queue_position: 2 },
      { analysis_status: 'processing' },
      { analysis_status: 'completed' },
    ];
    api.on('GET', '/api/v1/analytics/status/int-new', () => ({ json: { interview_id: 'int-new', ...(statuses.length > 1 ? statuses.shift() : statuses[0]) } }));
    api.on('GET', '/api/v1/analytics/results/int-new', {
      json: { interview_id: 'int-new', confidence_pct: 81, eye_contact_pct: 70, pause_count: 2, filler_word_count: 3, filler_words_detail: {},
        speech_rate_wpm: 120, dominant_emotion: 'neutral', emotion_distribution: {}, transcript: '', analysis_status: 'completed' },
    });

    await page.goto('/chat');
    await page.getByRole('button', { name: 'Görüntülü mülakata başla' }).click();
    await expect(page.getByText('Kaydediliyor')).toBeVisible();
    await page.waitForTimeout(1500); // MediaRecorder birkaç parça üretsin
    await page.getByRole('button', { name: 'Mülakatı Bitir' }).click();
    await page.getByRole('button', { name: 'Bitir', exact: true }).click();

    await expect(page.getByText('Analiz sırada: önünüzde 2 analiz var', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Hook kurallarını iyi açıkladınız.')).toBeVisible({ timeout: 15_000 });
    expect(api.callsTo('POST', '/api/v1/analytics/analyze/int-new')).toHaveLength(1);
    expect(api.callsTo('GET', '/api/v1/analytics/results/int-new')).toHaveLength(1);
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
