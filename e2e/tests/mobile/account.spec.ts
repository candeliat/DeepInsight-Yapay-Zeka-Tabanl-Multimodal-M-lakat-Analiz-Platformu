import { expect, test } from '../../fixtures/api';
import { FORGOT_MESSAGE } from '../../fixtures/data';

// Mobil (Expo web, telefon görünümü). Expo yığını önceki ekranları DOM'da tuttuğu için
// seçiciler `visible: true` ile görünen öğeye daraltılır.

test('giriş ekranı: sahte SSO yok, şifremi unuttum çalışır', async ({ page, api }) => {
  api.on('POST', '/api/v1/auth/forgot-password', { json: { message: FORGOT_MESSAGE } });
  await page.goto('/login');
  await expect(page.getByText('Hesabınıza giriş yapın')).toBeVisible();
  await expect(page.getByText(/google|apple|sso/i)).toHaveCount(0);
  await page.getByText('Şifremi Unuttum').click();
  await page.getByPlaceholder(/e-posta|ornek/i).filter({ visible: true }).first().fill('biri@example.com');
  await page.getByText(/bağlantı gönder/i).filter({ visible: true }).last().click();
  await expect(page.getByText(FORGOT_MESSAGE).filter({ visible: true })).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/auth/forgot-password')[0].body).toEqual({ email: 'biri@example.com' });
});

test.describe('profil', () => {
  test('yanlış mevcut şifrede sunucunun mesajı gösterilir; kısa şifre istek göndermez', async ({ authedPage: page, api }) => {
    api.on('POST', '/api/v1/auth/change-password', { status: 400, json: { detail: 'Mevcut şifreniz hatalı.' } });
    await page.goto('/profile');
    const fill = async (a: string, b: string, c: string) => {
      await page.getByLabel('Mevcut şifre').fill(a);
      await page.getByLabel('Yeni şifre', { exact: true }).fill(b);
      await page.getByLabel('Yeni şifre (tekrar)').fill(c);
      await page.getByText('Şifreyi değiştir').filter({ visible: true }).click();
    };
    await fill('mevcut-e2e', 'kisa', 'kisa');
    await expect(page.getByText('Yeni şifre en az 8 karakter olmalı.')).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/auth/change-password')).toHaveLength(0);

    await fill('yanlis-e2e', 'uzun-sifre-1', 'uzun-sifre-1');
    await expect(page.getByText('Mevcut şifreniz hatalı.')).toBeVisible();
  });

  test('video onamını geri çekmek önce onay ister', async ({ authedPage: page, api }) => {
    api.state.consentGranted = true;
    await page.goto('/profile');
    const toggle = page.getByRole('switch', { name: 'Video analizi onamı' });
    await expect(toggle).toBeChecked();

    await toggle.click();
    await expect(page.getByText('Emin misiniz?', { exact: false })).toBeVisible();
    await page.getByText('Vazgeç').filter({ visible: true }).first().click();
    await expect(toggle).toBeChecked();
    expect(api.callsTo('PUT', '/api/v1/account/consents/video_analysis')).toHaveLength(0);

    await toggle.click();
    await page.getByText('Geri çek ve sil').filter({ visible: true }).click();
    await expect(page.getByText('Verilmedi. Görüntülü mülakat başlatırken onam istenir.')).toBeVisible();
    expect(api.callsTo('PUT', '/api/v1/account/consents/video_analysis')[0].body).toEqual({ granted: false });
  });

  test('çıkış yapmadan önce onay sorulur', async ({ authedPage: page }) => {
    await page.goto('/profile');
    await page.getByText('Çıkış Yap').filter({ visible: true }).click();
    await expect(page.getByText('Hesabınızdan çıkış yapılsın mı?')).toBeVisible();
    await page.getByText('Vazgeç').filter({ visible: true }).last().click();
    await expect(page.getByText('Hesabınızdan çıkış yapılsın mı?')).toHaveCount(0);
    await expect(page).toHaveURL(/\/profile/);
  });
});
