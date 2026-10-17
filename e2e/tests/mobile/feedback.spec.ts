import { expect, test } from '../../fixtures/api';

// Mobil geri bildirim ekranı (Profil > Geri Bildirim).
const shown = (page: import('@playwright/test').Page, text: string | RegExp, exact = false) =>
  page.getByText(text, { exact }).filter({ visible: true });

test('profilden açılır; özellik önerisi gönderilir ve listede görünür', async ({ authedPage: page, api }) => {
  let mine: Record<string, unknown>[] = [];
  const bodies: string[] = [];
  api.on('GET', '/api/v1/feedback/me', () => ({ json: mine }));
  api.on('POST', '/api/v1/feedback', ({ req }) => {
    bodies.push(req.postDataBuffer()?.toString('latin1') ?? '');
    mine = [{ id: 'fb-9', kind: 'feature', title: 'Karanlık tema', status: 'new', admin_note: null, created_at: null }];
    return { json: { id: 'fb-9', status: 'new' } };
  });

  await page.goto('/profile');
  await shown(page, 'Geri Bildirim', true).click();
  await expect(page).toHaveURL(/\/feedback/);
  await page.getByRole('radio', { name: /Özellik önerisi/ }).filter({ visible: true }).click();
  await page.getByLabel('Başlık').filter({ visible: true }).fill('Karanlık tema');
  await page.getByLabel('Açıklama').filter({ visible: true }).fill('Gece kullanırken göz yoruluyor.');
  await shown(page, 'Gönder', true).click();

  await expect(shown(page, 'Teşekkürler, geri bildiriminiz alındı.')).toBeVisible();
  await expect(shown(page, 'Karanlık tema', true)).toBeVisible();
  expect(bodies[0]).toContain('name="kind"\r\n\r\nfeature');
  expect(bodies[0]).toContain('name="platform"\r\n\r\nmobile');
});
