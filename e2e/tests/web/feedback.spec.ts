import { expect, test } from '../../fixtures/api';

// Geri bildirim: kullanıcı formu (ekran görüntüsüyle) ve admin paneli sekmesi.

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e000502027f3c5fa2e10000000049454e44ae426082', 'hex');

test('hata bildirimi ekran görüntüsüyle gönderilir ve listede durumuyla görünür', async ({ authedPage: page, api }) => {
  const sent: string[] = [];
  let mine: Record<string, unknown>[] = [];
  api.on('GET', '/api/v1/feedback/me', () => ({ json: mine }));
  api.on('POST', '/api/v1/feedback', ({ req }) => {
    sent.push(req.postDataBuffer()?.toString('latin1') ?? '');
    mine = [{ id: 'fb-1', kind: 'bug', title: 'Eşleştir butonu donuyor', status: 'new', admin_note: null, created_at: '2026-10-17T10:00:00Z' }];
    return { json: { id: 'fb-1', status: 'new' } };
  });

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Geri Bildirim' }).click();
  await expect(page.getByText('Henüz geri bildirim göndermediniz.')).toBeVisible();

  const form = page.getByRole('form', { name: 'Geri bildirim formu' });
  await expect(form.getByRole('radio', { name: /Hata bildirimi/ })).toHaveAttribute('aria-checked', 'true');
  await form.getByLabel('Başlık').fill('Eşleştir butonu donuyor');
  await form.getByLabel('Açıklama').fill('İlan sayfasında Eşleştir deyince 2 dakika bekliyor.');
  await form.getByLabel('Sayfa').fill('İlan Eşleştirme');
  await form.locator('input[type=file]').setInputFiles({ name: 'ss.png', mimeType: 'image/png', buffer: PNG });
  await expect(form.getByAltText('Eklenen ekran görüntüsü')).toBeVisible();
  await form.getByRole('button', { name: 'Gönder' }).click();

  await expect(form.getByRole('status')).toContainText('geri bildiriminiz alındı');
  await expect(page.getByRole('region', { name: 'Gönderdiklerim' })).toContainText('Eşleştir butonu donuyor');
  await expect(page.getByText('Yeni', { exact: true })).toBeVisible();
  expect(sent[0]).toContain('name="kind"\r\n\r\nbug');
  expect(sent[0]).toContain('name="platform"\r\n\r\nweb');
  expect(sent[0]).toContain('filename="ss.png"');
});

test('PDF ekran görüntüsü olarak kabul edilmez; özellik önerisi seçilebilir', async ({ authedPage: page, api }) => {
  api.on('GET', '/api/v1/feedback/me', { json: [] });
  await page.goto('/feedback');
  const form = page.getByRole('form', { name: 'Geri bildirim formu' });
  await form.getByRole('radio', { name: /Özellik önerisi/ }).click();
  await expect(form.getByLabel('Açıklama')).toHaveAttribute('placeholder', 'Ne olsun, neden işinize yarar?');
  await form.locator('input[type=file]').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await expect(form.getByRole('alert')).toContainText('PNG, JPG ya da WEBP');
});

test.describe('admin: geri bildirimler', () => {
  test.beforeEach(({ api }) => {
    api.state.user.app_metadata = { ...api.state.user.app_metadata, role: 'admin' } as typeof api.state.user.app_metadata;
    api.on('GET', '/api/v1/admin/overview', { json: { month: '2026-10', users: 1 } });
    api.on('GET', '/api/v1/admin/ai-usage', { json: { month: '2026-10', calls: 0, daily: [], by_feature: [], by_org: [], by_model: [], unpriced_models: [] } });
  });

  test('gönderen, ekran görüntüsü ve durum görünür; durum ve not kaydedilir; filtre çalışır', async ({ authedPage: page, api }) => {
    const items = [
      { id: 'fb-1', kind: 'bug', title: 'Eşleştir butonu donuyor', description: 'Adımlar...', status: 'new', admin_note: null,
        user_id: 'u1', user_email: 'ece@example.com', user_name: 'Ece Deneme', page: 'İlan Eşleştirme', platform: 'web',
        user_agent: 'UA', screenshot_url: 'data:image/png;base64,' + PNG.toString('base64'), has_screenshot: true,
        created_at: '2026-10-17T10:00:00Z', updated_at: null },
      { id: 'fb-2', kind: 'feature', title: 'Karanlık tema', description: 'Gece kullanımı için', status: 'planned', admin_note: null,
        user_id: null, user_email: null, user_name: null, page: null, platform: 'mobile', user_agent: null, screenshot_url: null,
        has_screenshot: false, created_at: '2026-10-16T10:00:00Z', updated_at: null },
    ];
    api.on('GET', '/api/v1/admin/feedback', ({ url }) => ({
      json: items.filter((f) => !url.searchParams.get('kind') || f.kind === url.searchParams.get('kind')),
    }));
    api.on('PATCH', '/api/v1/admin/feedback/fb-1', ({ body }) => ({ json: { id: 'fb-1', status: body.status ?? 'new', admin_note: body.admin_note ?? null } }));

    await page.goto('/admin');
    await page.getByRole('tab', { name: /Geri bildirimler/ }).click();
    const list = page.getByRole('region', { name: 'Gelen geri bildirimler' });
    await expect(list).toContainText('Gelen geri bildirimler (2)');
    const bug = list.getByRole('listitem').filter({ hasText: 'Eşleştir butonu donuyor' });
    await expect(bug).toContainText('Ece Deneme (ece@example.com)');
    await expect(bug).toContainText('Web · Sayfa: İlan Eşleştirme');
    await expect(bug.getByAltText('Eşleştir butonu donuyor ekran görüntüsü')).toBeVisible();
    await expect(list.getByRole('listitem').filter({ hasText: 'Karanlık tema' })).toContainText('(silinmiş hesap)');

    await bug.getByLabel('Eşleştir butonu donuyor durumu').selectOption('resolved');
    await expect.poll(() => api.callsTo('PATCH', '/api/v1/admin/feedback/fb-1')[0]?.body).toEqual({ status: 'resolved' });
    await bug.getByLabel('Eşleştir butonu donuyor notu').fill('PR #26 ile düzeltildi');
    await bug.getByRole('button', { name: 'Notu kaydet' }).click();
    await expect.poll(() => api.callsTo('PATCH', '/api/v1/admin/feedback/fb-1')[1]?.body).toEqual({ admin_note: 'PR #26 ile düzeltildi' });

    await page.getByLabel('Tür filtresi').selectOption('feature');
    await expect(list).toContainText('Gelen geri bildirimler (1)');
    await expect(list).not.toContainText('Eşleştir butonu donuyor');
  });
});
