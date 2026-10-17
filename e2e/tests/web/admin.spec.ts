import { expect, test } from '../../fixtures/api';

// Platform admin paneli: genel sayılar, yapay zekâ kullanımı ve envanteri.

const USAGE = {
  month: '2026-10', quota: null, interviews_started: 12, interviews_completed: 9, students: 4, calls: 39, failed_calls: 19,
  success_rate: 51.3, prompt_tokens: 30000, completion_tokens: 6443, total_tokens: 36443, metered_interviews: 2,
  tokens_per_interview: 1700, estimated_cost_usd: null, unpriced_models: ['openai/gpt-oss-20b'], active_users: 3,
  by_model: [{ model: 'openai/gpt-oss-20b', calls: 28, failed: 12, prompt_tokens: 20000, completion_tokens: 4000, avg_latency_ms: 21000, estimated_cost_usd: null }],
  by_purpose: [],
  by_feature: [
    { feature: 'Ön yazı', calls: 10, failed: 6, total_tokens: 12527, avg_latency_ms: 45000, purposes: ['cover_letter'] },
    { feature: 'Mülakat sonu değerlendirme', calls: 11, failed: 5, total_tokens: 11406, avg_latency_ms: 18000, purposes: ['evaluation'] },
  ],
  by_org: [
    { org_id: null, name: 'Bireysel / kişisel', calls: 36, total_tokens: 33029, users: 3, estimated_cost_usd: null },
    { org_id: 'org-a', name: 'Örnek Bootcamp', calls: 3, total_tokens: 3414, users: 1, estimated_cost_usd: null },
  ],
  daily: [{ date: '2026-10-16', calls: 20, total_tokens: 18000 }, { date: '2026-10-17', calls: 19, total_tokens: 18443 }],
};

const INVENTORY = {
  llm: {
    provider: 'integrate.api.nvidia.com',
    chain: [
      { order: 1, model: 'openai/gpt-oss-20b', json_mode: false, circuit_open: true, reopens_in_s: 95, since_start: { attempts: 4, successes: 2, failures: 2, total_tokens: 900 } },
      { order: 2, model: 'nvidia/nemotron-3-super-120b-a12b', json_mode: true, circuit_open: false, reopens_in_s: null, since_start: null },
    ],
    paid_fallback_enabled: false, attempt_timeout_s: 30, json_attempt_timeout_s: 60, prices_configured: false,
    purposes: [{ purpose: 'cover_letter', feature: 'Ön yazı', where: "İlana ve CV'ye özel motivasyon mektubu" }],
  },
  components: [{ id: 'whisper', name: 'Konuşmayı metne çevirme', model: 'Whisper small', runs: 'Sunucuda yerel', kind: 'Yapay zekâ', used_for: ['Mobilde sesli cevap'] }],
  note: 'Bu süreçte sayılar.',
};

test.describe('admin paneli', () => {
  test.beforeEach(({ api }) => {
    api.state.user.app_metadata = { ...api.state.user.app_metadata, role: 'admin' } as typeof api.state.user.app_metadata;
    api.on('GET', '/api/v1/admin/overview', { json: { month: '2026-10', users: 18, organizations: 2, interviews_total: 96, interviews_completed: 47, interviews_month: 12, cvs: 2, job_postings: 1 } });
    api.on('GET', '/api/v1/admin/ai-usage', ({ url }) => ({ json: { ...USAGE, month: url.searchParams.get('month') ?? '2026-10' } }));
    api.on('GET', '/api/v1/admin/ai-inventory', { json: INVENTORY });
  });

  test('menüde görünür; kullanım sekmesi özellik/kurum/model kırılımını gösterir', async ({ authedPage: page, api }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Admin Paneli' }).click();
    await expect(page.getByRole('heading', { name: 'Admin paneli' })).toBeVisible();
    await expect(page.getByText('47 tamamlandı · bu ay 12')).toBeVisible();

    await expect(page.getByRole('region', { name: 'Özelliğe göre' }).getByRole('row', { name: /Ön yazı/ })).toContainText('12.527');
    await expect(page.getByRole('region', { name: /Kuruma göre/ }).getByRole('row', { name: /Bireysel/ })).toContainText('33.029');
    await expect(page.getByRole('region', { name: 'Modele göre' })).toContainText('21,0 sn');
    await expect(page.getByText('Fiyatı tanımsız: openai/gpt-oss-20b')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Günlük model çağrısı, 2 gün' })).toBeVisible();

    const previous = await page.getByLabel('Ay').locator('option').nth(1).getAttribute('value');
    await page.getByLabel('Ay').selectOption(previous!);
    await expect.poll(() => api.callsTo('GET', '/api/v1/admin/ai-usage').map((c) => c.query.get('month'))).toContain(previous);
  });

  test('envanter sekmesi zinciri, devre durumunu ve bileşenleri gösterir', async ({ authedPage: page }) => {
    await page.goto('/admin');
    await page.getByRole('tab', { name: /Yapay zekâ envanteri/ }).click();
    const chain = page.getByRole('region', { name: 'Dil modeli (LLM) zinciri' });
    await expect(chain.getByRole('row', { name: /gpt-oss-20b/ })).toContainText('Devre açık (95 sn)');
    await expect(chain.getByRole('row', { name: /nemotron/ })).toContainText('Kullanımda');
    await expect(chain).toContainText('Sağlayıcı: integrate.api.nvidia.com');
    await expect(page.getByRole('region', { name: 'Dil modelinin kullanıldığı yerler' })).toContainText('cover_letter');
    await expect(page.getByText('Whisper small · Sunucuda yerel')).toBeVisible();
  });
});

test('admin olmayan kullanıcı menüde görmez, sayfada uyarı alır', async ({ authedPage: page, api }) => {
  await page.goto('/admin');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('yalnızca platform yöneticileri');
  await expect(page.getByRole('link', { name: 'Admin Paneli' })).toHaveCount(0);
  expect(api.callsTo('GET', '/api/v1/admin/overview')).toHaveLength(0);
});
