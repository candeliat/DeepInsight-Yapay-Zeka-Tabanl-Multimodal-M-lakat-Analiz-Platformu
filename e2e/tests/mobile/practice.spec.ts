import { expect, test } from '../../fixtures/api';
import { FIRST_QUESTION } from '../../fixtures/data';

// Raporlar > Pratik seti ve setle mülakat.
const shown = (page: import('@playwright/test').Page, text: string | RegExp, exact = false) =>
  page.getByText(text, { exact }).filter({ visible: true });

test('pratik seti maddeleri açılır; setle mülakat soru kimlikleriyle başlar', async ({ authedPage: page, api }) => {
  api.on('POST', '/api/v1/interview/start', { json: { interview_id: 'int-new', first_message: FIRST_QUESTION } });
  await page.goto('/reports');
  await expect(shown(page, 'BFS ile DFS arasındaki fark nedir?')).toBeVisible();
  await shown(page, 'İyi bir cevapta olması gerekenler', true).first().click();
  await expect(shown(page, '• BFS kuyruk, DFS yığın kullanır')).toBeVisible();

  await shown(page, 'Bu setle mülakat yap', true).click();
  await expect(page).toHaveURL(/\/prepare\?.*practice=pq-1%2Cpq-2/);
  await expect(shown(page, /Raporlar ekranındaki 2 soruyla/)).toBeVisible();
  await page.getByText('Yazılı', { exact: true }).click();
  await page.getByText('Başla', { exact: true }).click();
  await expect(page).toHaveURL(/\/interview-room/);
  expect(api.callsTo('POST', '/api/v1/interview/start')[0].body).toMatchObject({ question_ids: ['pq-1', 'pq-2'] });
});
