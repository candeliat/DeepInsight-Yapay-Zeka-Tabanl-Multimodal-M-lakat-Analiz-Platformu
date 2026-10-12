import { expect, test } from '../../fixtures/api';
import { USER } from '../../fixtures/data';

// Oturum dayanıklılığı: geçici hata oturumu kapatmamalı; token süresi dolunca sessizce
// yenilenmeli; yalnızca refresh token reddedilince çıkış yapılmalı.

const tokenCookie = async (page: import('@playwright/test').Page) =>
  (await page.context().cookies()).find((c) => c.name === 'token')?.value;

test('profil isteği geçici hata (503) verirse oturum kapanmaz, yeniden denenip sayfa dolar', async ({ authedPage: page, api }) => {
  let calls = 0;
  api.on('GET', '/api/v1/users/me', () =>
    ++calls === 1 ? { status: 503, json: { detail: 'Kimlik doğrulama servisine şu an ulaşılamıyor.' } } : { json: USER },
  );
  await page.goto('/dashboard');
  await expect(page.getByText('Yarıda kalan bir mülakatın var')).toBeVisible();
  expect(calls).toBe(2);
  expect(await tokenCookie(page)).toBe('e2e-token');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('süresi dolan token yenilenir ve istek tekrarlanır', async ({ authedPage: page, api, context, baseURL }) => {
  await context.addCookies([{ name: 'refresh_token', value: 'e2e-refresh', url: baseURL! }]);
  api.on('GET', '/api/v1/users/me', ({ req }) =>
    req.headers()['authorization'] === 'Bearer yeni-token' ? { json: USER } : { status: 401, json: { detail: 'expired' } },
  );
  api.on('POST', '/api/v1/auth/refresh', { json: { access_token: 'yeni-token', refresh_token: 'yeni-refresh', user: {} } });

  await page.goto('/profile');
  await expect(page.getByLabel('Hedef pozisyon')).toHaveValue('Frontend Geliştirici');
  expect(await tokenCookie(page)).toBe('yeni-token');
  // Aynı anda 401 alan istekler tek bir yenilemeyi paylaşır (refresh token iki kez harcanmaz).
  expect(api.callsTo('POST', '/api/v1/auth/refresh')).toHaveLength(1);
});

test('yenileme servisine ulaşılamazsa (503) oturum korunur', async ({ authedPage: page, api, context, baseURL }) => {
  await context.addCookies([{ name: 'refresh_token', value: 'e2e-refresh', url: baseURL! }]);
  api.on('GET', '/api/v1/users/me', { status: 401, json: { detail: 'expired' } });
  api.on('POST', '/api/v1/auth/refresh', { status: 503, json: { detail: 'ulaşılamıyor' } });
  await page.goto('/dashboard');
  await expect.poll(() => api.callsTo('POST', '/api/v1/auth/refresh').length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await tokenCookie(page)).toBe('e2e-token');
});

test('refresh token reddedilirse oturum kapanır ve girişe dönülür', async ({ authedPage: page, api, context, baseURL }) => {
  await context.addCookies([{ name: 'refresh_token', value: 'e2e-refresh', url: baseURL! }]);
  api.on('GET', '/api/v1/users/me', { status: 401, json: { detail: 'expired' } });
  api.on('POST', '/api/v1/auth/refresh', { status: 401, json: { detail: 'Refresh token geçersiz veya süresi dolmuş.' } });
  await page.goto('/dashboard');
  await expect.poll(() => tokenCookie(page)).toBeUndefined();
  await page.goto('/interviews');
  await expect(page).toHaveURL(/\/login/);
});
