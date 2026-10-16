import { expect, test } from '../../fixtures/api';
import { ORG_ADMIN } from '../../fixtures/data';

// Ödev hatırlatma: üst çubuktaki bildirim zili ve kurum panelindeki "Hatırlat".

test.describe('bildirim zili', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('okunmamış sayısı görünür; bildirime tıklayınca okundu sayılır ve ödevlere gidilir', async ({ authedPage: page, api }) => {
    await page.goto('/dashboard');
    const bell = page.getByRole('button', { name: 'Bildirimler (2 okunmamış)' });
    await expect(bell).toBeVisible();
    await bell.click();

    const panel = page.getByRole('region', { name: 'Bildirimler' });
    await expect(panel.getByRole('button')).toHaveCount(4); // "Tümünü okundu say" + 3 bildirim
    await expect(panel).toContainText('Son tarih yaklaşıyor: React haftalık pratik');
    await expect(panel).toContainText('Son tarih: 01.12.2026 21:00');

    await panel.getByRole('button', { name: /Son tarih yaklaşıyor/ }).click();
    await expect(page).toHaveURL(/\/assignments$/);
    expect(api.callsTo('POST', '/api/v1/notifications/read')[0].body).toEqual({ ids: ['n-due'] });
    await expect(page.getByRole('button', { name: 'Bildirimler (1 okunmamış)' })).toBeVisible();
  });

  test('tümünü okundu say rozeti kaldırır', async ({ authedPage: page, api }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Bildirimler \(2 okunmamış\)/ }).click();
    await page.getByRole('button', { name: 'Tümünü okundu say' }).click();
    await expect(page.getByRole('button', { name: 'Bildirimler', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tümünü okundu say' })).toHaveCount(0);
    expect(api.callsTo('POST', '/api/v1/notifications/read')[0].body).toEqual({});
  });

  test('bildirim yoksa boş durum; Escape ile kapanır', async ({ authedPage: page, api }) => {
    api.career.notifications = [];
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).click();
    await expect(page.getByText('Bildiriminiz yok.', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Bildirimler' })).toHaveCount(0);
  });
});

test.describe('kurum paneli: hatırlat', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
    api.career.orgAssignments = [
      {
        id: 'as-1', org_id: ORG_ADMIN, title: 'React haftalık pratik', role: 'Frontend Developer', topic: 'React', difficulty: 'ORTA',
        instructions: null, due_at: '2026-12-01T18:00:00+00:00', group_id: null, created_at: null, last_reminded_at: null,
        total_candidates: 3, completed_count: 1, in_progress_count: 0,
      },
      {
        id: 'as-2', org_id: ORG_ADMIN, title: 'Herkes bitirdi', role: 'Backend', topic: 'SQL', difficulty: 'ORTA',
        instructions: null, due_at: null, group_id: null, created_at: null, last_reminded_at: null,
        total_candidates: 2, completed_count: 2, in_progress_count: 0,
      },
    ];
  });

  test('tamamlamayanlara hatırlatma gönderilir, düğme 12 saat kilitlenir', async ({ authedPage: page, api }) => {
    await page.goto(`/organizations/${ORG_ADMIN}`);
    const item = page.getByRole('listitem').filter({ hasText: 'React haftalık pratik' });
    await item.getByRole('button', { name: 'Hatırlat' }).click();
    await expect(item.getByRole('status')).toHaveText('2 öğrenciye hatırlatma gönderildi.');
    await expect(item.getByRole('button', { name: /Hatırlatıldı/ })).toBeDisabled();
    expect(api.callsTo('POST', `/api/v1/organizations/${ORG_ADMIN}/assignments/as-1/remind`)).toHaveLength(1);

    // Herkesin tamamladığı ödevde düğme yok.
    const done = page.getByRole('listitem').filter({ hasText: 'Herkes bitirdi' });
    await expect(done.getByRole('button', { name: /Hatırlat/ })).toHaveCount(0);
  });

  test('sunucu bekleme süresini bildirirse mesaj gösterilir', async ({ authedPage: page, api }) => {
    // Başka bir oturumdan az önce hatırlatılmış; bu sayfa eski listeyi gösteriyor.
    api.on('GET', `/api/v1/organizations/${ORG_ADMIN}/assignments`, () => ({
      json: api.career.orgAssignments.map((a) => ({ ...a, last_reminded_at: null })),
    }));
    api.career.orgAssignments[0].last_reminded_at = '2026-10-16T21:00:00+00:00';
    await page.goto(`/organizations/${ORG_ADMIN}`);
    const item = page.getByRole('listitem').filter({ hasText: 'React haftalık pratik' });
    await item.getByRole('button', { name: 'Hatırlat' }).click();
    await expect(item.getByRole('status')).toContainText('son 12 saatte hatırlatma gönderildi');
  });
});
