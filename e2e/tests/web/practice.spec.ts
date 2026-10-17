import { expect, test } from '../../fixtures/api';
import { FIRST_QUESTION } from '../../fixtures/data';

// Gelişimim > Pratik seti: sorular, cevap maddeleri ve setle mülakat.

test('pratik seti listelenir; maddeler açılır; setle mülakat bu sorularla başlar', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });
  await page.goto('/progress');
  const panel = page.getByRole('region', { name: 'Pratik seti' });
  await expect(panel.getByText('BFS ile DFS arasındaki fark nedir?')).toBeVisible();
  await expect(panel).toContainText('Veri Yapıları: 51');
  await expect(panel.getByText('BFS kuyruk, DFS yığın kullanır')).toBeHidden();
  await panel.getByText('İyi bir cevapta olması gerekenler').click();
  await expect(panel.getByText('BFS kuyruk, DFS yığın kullanır')).toBeVisible();
  await expect(panel.getByText('Bu soru için hazır cevap maddesi yok.')).toBeVisible();

  await panel.getByRole('link', { name: 'Bu setle mülakat yap' }).click();
  await expect(page).toHaveURL(/\/chat\/text\?.*practice=pq-1%2Cpq-2/);
  await expect(page.getByText('mülakat Gelişimim sayfasındaki 2 soruyla yapılacak.')).toBeVisible();
  await page.getByRole('button', { name: 'Mülakata Başla' }).click();
  await expect(page.getByText(FIRST_QUESTION)).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body).toMatchObject({
    role: 'Backend Developer', topic: 'Veri Yapıları', difficulty: 'ORTA', question_ids: ['pq-1', 'pq-2'],
  });
});

test('bankada soru yoksa açıklama gösterilir, mülakat düğmesi çıkmaz', async ({ authedPage: page, api }) => {
  api.on('GET', '/api/v1/progress/me/practice-set', {
    json: { topics: [{ topic: 'Kuantum', role: 'X', difficulty: 'ORTA', average: 30, count: 1, weak: true }], items: [], unmatched_topics: ['Kuantum'], reason: 'no_questions' },
  });
  await page.goto('/progress');
  const panel = page.getByRole('region', { name: 'Pratik seti' });
  await expect(panel).toContainText('uygun soru bulunamadı (Kuantum)');
  await expect(panel.getByRole('link', { name: 'Bu setle mülakat yap' })).toHaveCount(0);
});
