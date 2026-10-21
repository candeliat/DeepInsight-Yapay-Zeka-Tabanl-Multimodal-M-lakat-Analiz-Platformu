import { expect, test } from '../../fixtures/api';
import { ONGOING_ID } from '../../fixtures/data';

// Ana sayfa ve mülakat listesi: tek skor ölçeği (yüzdesiz), yarıda kalana devam.

test('ana sayfa yarıda kalan mülakat için devam bandı gösterir', async ({ authedPage: page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Yarıda kalan bir mülakatın var')).toBeVisible();
  await expect(page.getByRole('link', { name: /Kaldığın yerden devam et/ }).first()).toHaveAttribute(
    'href',
    `/chat/text?resume=${ONGOING_ID}`,
  );
});

test('mülakat listesi: skorlar yüzdesiz, bant etiketleri 60/80 eşiğiyle, yarıda kalan devam bağlantısı', async ({ authedPage: page }) => {
  await page.goto('/interviews');
  const main = page.getByRole('main');
  await expect(main.getByText('Sonuçları gör').first()).toBeVisible();

  await expect(main).not.toContainText('%');
  for (const [score, label] of [['85', 'Güçlü'], ['72', 'Gelişiyor'], ['45', 'Geliştirilmeli']]) {
    const card = main.getByRole('link').filter({ hasText: score });
    await expect(card).toContainText(label);
  }
  const ongoing = main.getByRole('link').filter({ hasText: 'Yarıda kaldı' });
  await expect(ongoing).toHaveAttribute('href', `/chat/text?resume=${ONGOING_ID}`);
  await expect(ongoing).toContainText('Kaldığın yerden devam et');
});

test('dar ekranda menü çekmece olarak açılır, sayfa değişince kapanır; yatay taşma yok', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  const menu = page.getByRole('button', { name: 'Menü', exact: true });
  const nav = page.getByRole('navigation', { name: 'Ana menü' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await nav.getByRole('link', { name: 'Mülakatlarım' }).click();
  await expect(page).toHaveURL(/\/interviews$/);
  await expect(nav).toBeHidden();

  await menu.click();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
});
