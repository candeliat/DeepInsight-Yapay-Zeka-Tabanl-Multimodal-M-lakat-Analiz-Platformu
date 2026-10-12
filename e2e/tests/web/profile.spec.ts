import { expect, test } from '../../fixtures/api';

// Profil: kişisel bilgiler, şifre değiştirme doğrulamaları, video onamını geri çekme.

test('profil: istatistikler yüzdesiz, hedef pozisyon kaydedilir', async ({ authedPage: page, api }) => {
  await page.goto('/profile');
  await expect(page.getByText('Ort. Başarı Puanı')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('%');

  const target = page.getByLabel('Hedef pozisyon');
  await expect(target).toHaveValue('Frontend Geliştirici');
  await target.fill('Backend Geliştirici');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible();
  expect(api.callsTo('PATCH', '/api/v1/users/me')[0].body).toMatchObject({ target: 'Backend Geliştirici' });
});

test.describe('şifre değiştirme', () => {
  const fillPasswords = async (page: import('@playwright/test').Page, current: string, next: string, repeat: string) => {
    await page.getByLabel('Mevcut şifre').fill(current);
    await page.getByLabel('Yeni şifre', { exact: true }).fill(next);
    await page.getByLabel('Yeni şifre (tekrar)').fill(repeat);
    await page.getByRole('button', { name: 'Şifreyi değiştir' }).click();
  };

  test('kısa ve eşleşmeyen şifre Türkçe uyarı verir, istek gitmez', async ({ authedPage: page, api }) => {
    await page.goto('/profile');
    // Tarayıcının minLength doğrulaması formu durdurmasın: uygulamanın kendi mesajı denetleniyor.
    await page.locator('form').filter({ hasText: 'Şifreyi değiştir' }).evaluate((f) => f.setAttribute('novalidate', ''));
    await fillPasswords(page, 'mevcut-e2e', 'kisa', 'kisa');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Yeni şifre en az 8 karakter olmalı.');
    await fillPasswords(page, 'mevcut-e2e', 'uzun-sifre-1', 'uzun-sifre-2');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Yeni şifreler eşleşmiyor.');
    expect(api.callsTo('POST', '/api/v1/auth/change-password')).toHaveLength(0);
  });

  test('yanlış mevcut şifrede sunucunun mesajı gösterilir', async ({ authedPage: page, api }) => {
    api.on('POST', '/api/v1/auth/change-password', { status: 400, json: { detail: 'Mevcut şifreniz hatalı.' } });
    await page.goto('/profile');
    await fillPasswords(page, 'yanlis-e2e', 'uzun-sifre-1', 'uzun-sifre-1');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Mevcut şifreniz hatalı.');
  });

  test('başarılı değişiklikte alanlar temizlenir', async ({ authedPage: page, api }) => {
    api.on('POST', '/api/v1/auth/change-password', { json: { message: 'Şifreniz güncellendi.' } });
    await page.goto('/profile');
    await fillPasswords(page, 'mevcut-e2e', 'uzun-sifre-1', 'uzun-sifre-1');
    await expect(page.getByText('Şifreniz güncellendi.')).toBeVisible();
    await expect(page.getByLabel('Mevcut şifre')).toHaveValue('');
    expect(api.callsTo('POST', '/api/v1/auth/change-password')[0].body).toEqual({
      current_password: 'mevcut-e2e',
      new_password: 'uzun-sifre-1',
    });
  });
});

test.describe('video analizi onamı', () => {
  test.beforeEach(({ api }) => {
    api.state.consentGranted = true;
  });

  test('geri çekme onay ister; Vazgeç onamı korur, onaylanınca geri çekilir', async ({ authedPage: page, api }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Onamı geri çek' }).click();
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.getByRole('button', { name: 'Onamı geri çek' })).toBeVisible();
    expect(api.callsTo('PUT', '/api/v1/account/consents/video_analysis')).toHaveLength(0);

    await page.getByRole('button', { name: 'Onamı geri çek' }).click();
    await page.getByRole('button', { name: 'Geri çek ve sil' }).click();
    await expect(page.getByText('Onam vermediniz')).toBeVisible();
    expect(api.callsTo('PUT', '/api/v1/account/consents/video_analysis')[0].body).toEqual({ granted: false });
  });

  test('geri çekme başarısız olursa hata gösterilir', async ({ authedPage: page, api }) => {
    api.on('PUT', '/api/v1/account/consents/video_analysis', { status: 503, json: { detail: 'Servis geçici olarak kullanılamıyor.' } });
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Onamı geri çek' }).click();
    await page.getByRole('button', { name: 'Geri çek ve sil' }).click();
    await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'Servis geçici olarak kullanılamıyor.' })).toBeVisible();
    await expect(page.getByText('onam verdiniz')).toBeVisible();
  });
});
