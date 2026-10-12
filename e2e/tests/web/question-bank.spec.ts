import { expect, test } from '../../fixtures/api';

// Soru Bankası (platform yöneticisi): tarayıcının confirm()/alert() pencereleri yerine
// uygulama içi onay ve hata bandı. Ortak hata mesajı yardımcısı (lib/apiError) da burada sınanır.

const QUESTION = {
  id: 'q-1', role: 'Backend Developer', topic: 'Python', difficulty: 'ORTA',
  question_text: 'Python’da GIL nedir ve çok iş parçacıklı kodu nasıl etkiler?',
  tags: [], family_id: null, times_served: 3, is_active: true, created_at: null,
};

test.beforeEach(({ api }) => {
  let questions = [structuredClone(QUESTION)];
  api.state.user.app_metadata = { ...api.state.user.app_metadata, role: 'admin' } as typeof api.state.user.app_metadata;
  api.on('GET', '/api/v1/question-bank/questions', () => ({ json: questions }));
  api.on('GET', '/api/v1/question-bank/gaps', { json: [] });
  api.on('GET', '/api/v1/question-bank/candidates', { json: [] });
  api.on('DELETE', /^\/api\/v1\/question-bank\/questions\/[^/]+$/, () => {
    questions = [];
    return { json: { status: 'deleted' } };
  });
});

test('silme tarayıcı penceresi açmadan satır içinde onay ister', async ({ authedPage: page, api }) => {
  // Yerel confirm()/alert() açılırsa test düşer.
  page.on('dialog', (d) => {
    throw new Error(`beklenmeyen tarayıcı penceresi: ${d.type()} ${d.message()}`);
  });
  await page.goto('/question-bank');
  await expect(page.getByText(QUESTION.question_text)).toBeVisible();

  await page.getByRole('button', { name: 'Soruyu sil' }).click();
  await expect(page.getByText('Kalıcı olarak silinsin mi?')).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  expect(api.callsTo('DELETE', '/api/v1/question-bank/questions/q-1')).toHaveLength(0);

  await page.getByRole('button', { name: 'Soruyu sil' }).click();
  await page.getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByText('Henüz soru eklenmemiş.')).toBeVisible();
  expect(api.callsTo('DELETE', '/api/v1/question-bank/questions/q-1')).toHaveLength(1);
});

test('işlem hatası sayfada bant olarak gösterilir ve kapatılabilir', async ({ authedPage: page, api }) => {
  page.on('dialog', (d) => {
    throw new Error(`beklenmeyen tarayıcı penceresi: ${d.message()}`);
  });
  api.on('PATCH', /^\/api\/v1\/question-bank\/questions\/[^/]+$/, { status: 409, json: { detail: 'Bu soru şu an bir mülakatta kullanılıyor.' } });
  await page.goto('/question-bank');
  await page.getByRole('button', { name: 'Soruyu pasifleştir' }).click();

  const banner = page.getByRole('main').getByRole('alert');
  await expect(banner).toContainText('Bu soru şu an bir mülakatta kullanılıyor.');
  await banner.getByRole('button', { name: 'Kapat' }).click();
  await expect(banner).toHaveCount(0);
});

test('doğrulama hatası (422 dizi) okunur bir mesaja çevrilir', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/question-bank/questions', {
    status: 422,
    json: { detail: [{ loc: ['body', 'question_text'], msg: 'Soru metni en fazla 1000 karakter olabilir.', type: 'value_error' }] },
  });
  await page.goto('/question-bank');
  await page.getByPlaceholder('Örn: Backend Developer').fill('Backend Developer');
  await page.getByPlaceholder('Örn: Python').fill('Python');
  await page.getByPlaceholder('Mülakat sorusunu buraya yazın...').fill('Bir REST API’yi nasıl sürümlersiniz?');
  await page.getByRole('button', { name: 'Soruyu Ekle' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Soru metni en fazla 1000 karakter olabilir.');
});

test('sunucuya ulaşılamazsa İngilizce axios metni yerine Türkçe mesaj gösterilir', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/question-bank/questions', 'abort');
  await page.goto('/question-bank');
  await page.getByPlaceholder('Örn: Backend Developer').fill('Backend Developer');
  await page.getByPlaceholder('Örn: Python').fill('Python');
  await page.getByPlaceholder('Mülakat sorusunu buraya yazın...').fill('Bir REST API’yi nasıl sürümlersiniz?');
  await page.getByRole('button', { name: 'Soruyu Ekle' }).click();
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('Sunucuya ulaşılamadı');
  await expect(alert).not.toContainText('Network Error');
});
