import { expect, test } from '../../fixtures/api';
import { FORGOT_MESSAGE } from '../../fixtures/data';

// Oturumsuz sayfalar: kayıt, giriş, şifremi unuttum, aydınlatma metni ve yönlendirme.

test('oturum yoksa korumalı sayfa girişe yönlendirir', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('giriş sayfasında sahte SSO düğmesi yok; şifremi unuttum ve aydınlatma metni bağlantıları var', async ({ page, api }) => {
  void api;
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Şifremi unuttum' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aydınlatma metni' })).toBeVisible();
  await expect(page.getByRole('button', { name: /google|microsoft|sso/i })).toHaveCount(0);
});

test('kayıt: aydınlatma metni onaylanmadan gönderilmez, onaylanınca privacy_accepted ile gider', async ({ page, api }) => {
  api.on('POST', '/api/v1/auth/register', { json: { message: 'ok' } });
  await page.goto('/register');
  await page.locator('#name').fill('Ece Deneme');
  await page.locator('#email').fill('yeni.aday@example.com');
  await page.locator('#target').fill('Frontend Geliştirici');
  await page.locator('#password').fill('e2e-Sifre-123');
  await page.locator('#confirmPassword').fill('e2e-Sifre-123');

  await page.getByRole('button', { name: 'Kayıt Ol' }).click();
  // Onay kutusu zorunlu: istek gitmez, sayfada kalınır.
  await expect(page).toHaveURL(/\/register/);
  expect(api.callsTo('POST', '/api/v1/auth/register')).toHaveLength(0);

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Kayıt Ol' }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
  await expect(page.getByRole('status')).toContainText('Hesabınız oluşturuldu');

  const [call] = api.callsTo('POST', '/api/v1/auth/register');
  expect(call.body).toMatchObject({ email: 'yeni.aday@example.com', privacy_accepted: true, first_name: 'Ece', last_name: 'Deneme' });
});

test('şifremi unuttum: istek gider ve hesap varlığını sızdırmayan mesaj gösterilir', async ({ page, api }) => {
  api.on('POST', '/api/v1/auth/forgot-password', { json: { message: FORGOT_MESSAGE } });
  await page.goto('/forgot-password');
  await page.getByLabel('E-posta').fill('biri@example.com');
  await page.getByRole('button', { name: /gönder/i }).click();
  await expect(page.getByText('Bu e-postayla kayıtlı bir hesap varsa')).toBeVisible();
  expect(api.callsTo('POST', '/api/v1/auth/forgot-password')[0].body).toEqual({ email: 'biri@example.com' });
});

test('aydınlatma metni oturumsuz açılır', async ({ page }) => {
  await page.goto('/gizlilik');
  await expect(page).toHaveURL(/\/gizlilik/);
  await expect(page.getByRole('heading').first()).toBeVisible();
});
