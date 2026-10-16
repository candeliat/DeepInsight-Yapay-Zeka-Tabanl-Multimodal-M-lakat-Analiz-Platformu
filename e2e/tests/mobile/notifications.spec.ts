import { expect, test } from '../../fixtures/api';

// Mobil ödev bildirimleri: ana sayfadaki zil ve Bildirimler ekranı.
const shown = (page: import('@playwright/test').Page, text: string | RegExp, exact = false) =>
  page.getByText(text, { exact }).filter({ visible: true });

test.describe('bildirimler', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('ana sayfa zili okunmamış sayısını gösterir; bildirime dokununca ödevlere gidilir', async ({ authedPage: page, api }) => {
    await page.goto('/home');
    const bell = page.getByRole('button', { name: 'Bildirimler, 2 okunmamış' }).filter({ visible: true });
    await expect(bell).toBeVisible();
    await bell.click();

    await expect(page).toHaveURL(/\/notifications/);
    await expect(shown(page, '2 OKUNMAMIŞ', true)).toBeVisible();
    await expect(shown(page, 'Son tarih: 01.12.2026 21:00. Ödevi henüz tamamlamadınız.')).toBeVisible();

    await page.getByRole('button', { name: 'Son tarih yaklaşıyor: React haftalık pratik, okunmadı' }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/assignments/);
    expect(api.callsTo('POST', '/api/v1/notifications/read')[0].body).toEqual({ ids: ['n-due'] });
  });

  test('tümünü okundu say', async ({ authedPage: page, api }) => {
    await page.goto('/notifications');
    await shown(page, 'Tümünü okundu say', true).click();
    await expect(shown(page, 'TÜMÜ OKUNDU', true)).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/notifications/read')[0].body).toEqual({});
  });

  test('bildirim yoksa boş durum', async ({ authedPage: page, api }) => {
    api.career.notifications = [];
    await page.goto('/notifications');
    await expect(shown(page, 'Bildiriminiz yok.')).toBeVisible();
  });
});
