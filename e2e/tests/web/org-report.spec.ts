import { expect, test } from '../../fixtures/api';
import { ORG_ADMIN } from '../../fixtures/data';

// Kurum raporu (PDF) ve yöneticinin kullanım/maliyet paneli.

test.describe('kurum raporu ve kullanım', () => {
  test.beforeEach(async ({ api, authedPage: page }) => {
    api.seedCareer();
    await page.goto(`/organizations/${ORG_ADMIN}`);
    await expect(page.getByRole('heading', { name: 'Örnek Bootcamp' })).toBeVisible();
  });

  test('kullanım paneli ay seçimiyle yüklenir; fiyatı tanımsız model belirtilir', async ({ authedPage: page, api }) => {
    const panel = page.getByRole('region', { name: 'Yapay zekâ kullanımı ve maliyet' });
    await expect(panel.getByText('Model çağrısı')).toBeVisible();
    await expect(panel).toContainText('4 / 100'); // mülakat / kota
    await expect(panel).toContainText('25.200');
    await expect(panel).toContainText('Hesaplanmadı');
    await expect(panel).toContainText('Fiyatı tanımlı olmayan model: openai/gpt-oss-20b');
    await expect(panel.getByRole('row').filter({ hasText: 'openai/gpt-oss-20b' })).toContainText('8,4 sn');

    const select = panel.getByLabel('Ay');
    const previous = await select.locator('option').nth(1).getAttribute('value');
    await select.selectOption(previous!);
    await expect.poll(() => api.callsTo('GET', `/api/v1/organizations/${ORG_ADMIN}/usage`).map((c) => c.query.get('month')))
      .toContain(previous);
  });

  test('PDF raporu seçili grupla indirilir', async ({ authedPage: page, api }) => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Kurum raporu (PDF)' }).click();
    expect((await download).suggestedFilename()).toBe('kurum-raporu.pdf');
    const calls = api.callsTo('GET', `/api/v1/organizations/${ORG_ADMIN}/report.pdf`);
    expect(calls).toHaveLength(1);
    expect(calls[0].query.get('group_id')).toBeNull();
  });
});
