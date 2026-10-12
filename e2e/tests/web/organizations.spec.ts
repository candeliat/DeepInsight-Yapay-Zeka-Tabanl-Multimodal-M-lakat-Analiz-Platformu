import { expect, test } from '../../fixtures/api';
import { ORG_ADMIN, ORG_CANDIDATE } from '../../fixtures/data';

// Kurumlar (öğrenci), Ödevlerim ve kurum paneli (yönetici).

test.describe('Kurumlarım', () => {
  test.beforeEach(({ api }) => {
    api.seedCareer();
  });

  test('bekleyen davet kabul edilince kurum listeye eklenir', async ({ authedPage: page, api }) => {
    await page.goto('/organizations');
    await expect(page.getByText('Yeni Akademi sizi öğrenci olarak davet etti')).toBeVisible();
    await page.getByRole('button', { name: 'Kabul et' }).click();
    await expect(page.getByRole('status')).toContainText('"Yeni Akademi" kurumuna katıldınız.');
    await expect(page.getByText('Yeni Akademi', { exact: true })).toBeVisible();
    expect(api.callsTo('POST', '/api/v1/organizations/invites/inv-1/accept')).toHaveLength(1);
  });

  test('davet reddedilince kaybolur', async ({ authedPage: page, api }) => {
    await page.goto('/organizations');
    await page.getByRole('button', { name: 'Reddet' }).click();
    await expect(page.getByRole('status')).toContainText('Davet reddedildi.');
    await expect(page.getByText('sizi öğrenci olarak davet etti')).toHaveCount(0);
    expect(api.callsTo('POST', '/api/v1/organizations/invites/inv-1/decline')).toHaveLength(1);
  });

  test('geçersiz davet kodu hata verir; geçerli kodla katılınır', async ({ authedPage: page, api }) => {
    await page.goto('/organizations');
    const join = page.getByRole('button', { name: 'Katıl' });
    await expect(join).toBeDisabled();

    await page.getByLabel('Davet kodu').fill('YANLIS');
    await join.click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Geçersiz davet kodu');

    await page.getByLabel('Davet kodu').fill('KATIL-2026');
    await join.click();
    await expect(page.getByRole('status')).toContainText('"Katılım Akademisi" kurumuna katıldınız.');
    expect(api.callsTo('POST', '/api/v1/organizations/join').map((c) => c.body.invite_code)).toEqual(['YANLIS', 'KATIL-2026']);
  });

  test('öğrenci ilerleme paylaşımını açıp kapatabilir; yönetici kurumda panel bağlantısı var', async ({ authedPage: page, api }) => {
    await page.goto('/organizations');
    const share = page.getByRole('switch', { name: 'Örnek Üniversitesi Kariyer Merkezi ile ilerleme paylaşımı' });
    await expect(share).toHaveAttribute('aria-checked', 'false');
    await share.click();
    await expect(share).toHaveAttribute('aria-checked', 'true');
    expect(api.callsTo('PUT', `/api/v1/organizations/${ORG_CANDIDATE}/me/sharing`)[0].body).toEqual({ share_progress: true });

    await expect(page.getByRole('link', { name: /Kurum paneli/ })).toHaveAttribute('href', `/organizations/${ORG_ADMIN}`);
    // Yönetici olunan kurumda paylaşım anahtarı yok (yalnızca öğrenciler içindir).
    await expect(page.getByRole('switch')).toHaveCount(1);
  });

  test('hiç kurum yoksa boş durum gösterilir', async ({ authedPage: page, api }) => {
    api.career.orgs = [];
    api.career.invites = [];
    await page.goto('/organizations');
    await expect(page.getByText('Henüz bir kuruma üye değilsiniz.')).toBeVisible();
  });
});

test.describe('Ödevlerim', () => {
  test('yapılacak ve tamamlanan ödevler ayrılır; başla ve sonuç bağlantıları doğru', async ({ authedPage: page, api }) => {
    api.seedCareer();
    await page.goto('/assignments');
    await expect(page.getByText('Yapılacaklar (1)')).toBeVisible();
    await expect(page.getByText('Tamamlananlar (1)')).toBeVisible();

    const todo = page.getByRole('listitem').filter({ hasText: 'React haftalık pratik' });
    await expect(todo).toContainText('Son tarih:');
    await expect(todo).toContainText('Hook kurallarına odaklanın.');
    await expect(todo.getByRole('link', { name: 'Başla' })).toHaveAttribute('href', '/chat/text?assignment=as-todo');

    const done = page.getByRole('listitem').filter({ hasText: 'Veri yapıları tekrarı' });
    await expect(done).toContainText('82');
    await expect(done).not.toContainText('%');
    await expect(done.getByRole('link', { name: 'Sonuç' })).toHaveAttribute('href', '/interviews/int-strong');
  });

  test('ödevden açılan yazılı mülakatta rol ve konu ödevden gelir, değiştirilemez', async ({ authedPage: page, api }) => {
    api.seedCareer();
    await page.goto('/chat/text?assignment=as-todo');
    await expect(page.getByText('Ödev: React haftalık pratik')).toBeVisible();
    const inputs = page.getByRole('main').locator('input');
    await expect(inputs.nth(0)).toHaveValue('Frontend Developer');
    await expect(inputs.nth(0)).toHaveAttribute('readonly', '');
    await expect(inputs.nth(1)).toHaveValue('React');
  });

  test('ödev yoksa kuruma katılma yönlendirmesi gösterilir', async ({ authedPage: page }) => {
    await page.goto('/assignments');
    await expect(page.getByText('Size atanmış bir ödev yok.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Bir kuruma davet koduyla katılın/ })).toHaveAttribute('href', '/organizations');
  });
});

test.describe('kurum paneli (yönetici)', () => {
  test.beforeEach(async ({ api, authedPage: page }) => {
    api.seedCareer();
    await page.goto(`/organizations/${ORG_ADMIN}`);
    await expect(page.getByRole('heading', { name: 'Örnek Bootcamp' })).toBeVisible();
  });

  test('3 öğrenciden az katkıda toplu skorlar gizli; paylaşmayan öğrencinin skoru görünmez', async ({ authedPage: page }) => {
    await expect(page.getByText('en az 3 farklı öğrenci kurum adına mülakat yaptığında gösterilir')).toBeVisible();
    await expect(page.getByText('(şu an 2)', { exact: false })).toBeVisible();
    await expect(page.getByText('5/100')).toBeVisible();

    const ali = page.getByRole('row').filter({ hasText: 'Ali Öğrenci' });
    await expect(ali).toContainText('74');
    await expect(ali.getByRole('link', { name: /Gelişim/ })).toBeVisible();
    const ayse = page.getByRole('row').filter({ hasText: 'Ayşe Öğrenci' });
    await expect(ayse).toContainText('Paylaşılmadı');
    await expect(ayse.getByRole('link', { name: /Gelişim/ })).toHaveCount(0);
  });

  test('davet kodu onayla yenilenir', async ({ authedPage: page, api }) => {
    await expect(page.getByText('BOOT-2026')).toBeVisible();
    await page.getByRole('button', { name: /Kodu yenile|Yenile/ }).first().click();
    await page.getByRole('button', { name: 'Yenile', exact: true }).click();
    await expect(page.getByText('BOOT-YENI')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Yeni davet kodu oluşturuldu');
    expect(api.callsTo('POST', `/api/v1/organizations/${ORG_ADMIN}/invite-code/rotate`)).toHaveLength(1);
  });

  test('yeni ödev atanır ve listede görünür', async ({ authedPage: page, api }) => {
    await page.getByRole('button', { name: 'Yeni ödev' }).click();
    await page.getByLabel('Ödev başlığı').fill('TypeScript tipleri');
    await page.getByLabel('Rol', { exact: true }).fill('Frontend Developer');
    await page.getByLabel('Konu', { exact: true }).fill('TypeScript');
    await page.getByRole('button', { name: 'Ödevi ata' }).click();
    await expect(page.getByText('TypeScript tipleri')).toBeVisible();
    await expect(page.getByText('Ödevler (1)')).toBeVisible();
    expect(api.callsTo('POST', `/api/v1/organizations/${ORG_ADMIN}/assignments`)[0].body).toMatchObject({
      title: 'TypeScript tipleri',
      role: 'Frontend Developer',
      topic: 'TypeScript',
    });
  });

  test('toplu davet: geçerli ve geçersiz e-postalar ayrı raporlanır', async ({ authedPage: page, api }) => {
    await page.getByLabel('Davet edilecek e-postalar').fill('ali@okul.edu.tr\nayse@okul.edu.tr\nbozuk-adres');
    await page.getByRole('button', { name: /kişiyi davet et/ }).click();
    const result = page.getByRole('status').filter({ hasText: 'davet oluşturuldu' });
    await expect(result).toContainText('2 davet oluşturuldu.');
    await expect(result).toContainText('Geçersiz e-posta (1): bozuk-adres');
    expect(api.callsTo('POST', `/api/v1/organizations/${ORG_ADMIN}/invites`)[0].body.role).toBe('candidate');
  });
});

test('yetkisiz kurum paneli erişim hatası gösterir', async ({ authedPage: page, api }) => {
  api.seedCareer();
  api.on('GET', /^\/api\/v1\/organizations\/[^/]+\/overview$/, { status: 403, json: { detail: 'Bu kurumun panelini görme yetkiniz yok.' } });
  await page.goto(`/organizations/${ORG_CANDIDATE}`);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Bu kurumun panelini görme yetkiniz yok.');
});
