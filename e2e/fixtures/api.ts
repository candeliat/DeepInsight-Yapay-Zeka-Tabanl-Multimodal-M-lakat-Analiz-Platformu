import { test as base, expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';
import { careerState, installCareer, seedCareer } from './career';
import { consent, INTERVIEWS, ongoingDetail, ONGOING_ID, PROGRESS, USER } from './data';

/**
 * Backend taklidi: :8123'e giden her istek burada karşılanır, gerçek sunucuya gitmez.
 * Varsayılan uç noktalar aşağıda; bir test `api.on(...)` ile tek bir uç noktayı
 * değiştirebilir (sonra eklenen önce eşleşir). Karşılığı olmayan istek 404 alır ve
 * `api.unhandled`'a yazılır.
 */

export type Reply =
  | { status?: number; json?: unknown; body?: string; contentType?: string }
  | 'abort';
export type Handler = (ctx: { req: Request; url: URL; body: any }) => Reply | Promise<Reply>;

export interface Call {
  method: string;
  path: string;
  body: any;
}

const API_PORT = process.env.E2E_API_PORT ?? '8123';

export class MockApi {
  private routes: { method: string; pattern: RegExp; handler: Handler }[] = [];
  readonly calls: Call[] = [];
  readonly unhandled: string[] = [];
  /** Durum taşıyan varsayılanlar (ör. onam verilince sonraki GET'te de verili görünür). */
  state = { consentGranted: false, user: structuredClone(USER), interviews: structuredClone(INTERVIEWS) };
  /** CV, ilan, kurum ve ödev durumu (fixtures/career.ts). */
  readonly career = careerState();

  constructor() {
    this.installDefaults();
  }

  /** `path` regex'i yolun tamamıyla eşleşir (sorgu dizesi hariç). */
  on(method: string, path: string | RegExp, handler: Handler | Reply): this {
    const pattern = typeof path === 'string' ? new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : path;
    const h: Handler = typeof handler === 'function' ? handler : () => handler;
    this.routes.unshift({ method: method.toUpperCase(), pattern, handler: h });
    return this;
  }

  callsTo(method: string, path: string | RegExp): Call[] {
    return this.calls.filter(
      (c) => c.method === method.toUpperCase() && (typeof path === 'string' ? c.path === path : path.test(c.path)),
    );
  }

  async attach(context: BrowserContext) {
    await context.route((url) => url.port === API_PORT, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const origin = (await req.headerValue('origin')) ?? '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    };
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    let body: any = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    this.calls.push({ method: req.method(), path: url.pathname, body });

    const match = this.routes.find((r) => r.method === req.method() && r.pattern.test(url.pathname));
    if (!match) {
      this.unhandled.push(`${req.method()} ${url.pathname}`);
      await route.fulfill({ status: 404, headers: cors, json: { detail: 'e2e: bu uç nokta taklit edilmedi' } });
      return;
    }
    const reply = await match.handler({ req, url, body });
    if (reply === 'abort') {
      await route.abort('failed');
      return;
    }
    const status = reply.status ?? 200;
    if (reply.body !== undefined) {
      await route.fulfill({ status, headers: cors, body: reply.body, contentType: reply.contentType ?? 'text/plain' });
    } else {
      await route.fulfill({ status, headers: cors, json: reply.json ?? {} });
    }
  }

  private installDefaults() {
    const s = this.state;
    this.on('GET', '/api/v1/users/me', () => ({ json: s.user }));
    this.on('PATCH', '/api/v1/users/me', ({ body }) => {
      s.user.user_metadata = { ...s.user.user_metadata, ...body };
      return { json: s.user };
    });
    this.on('GET', '/api/v1/account/consents/video_analysis', () => ({ json: consent(s.consentGranted) }));
    this.on('PUT', '/api/v1/account/consents/video_analysis', ({ body }) => {
      s.consentGranted = !!body?.granted;
      return { json: consent(s.consentGranted) };
    });
    this.on('GET', '/api/v1/interview/me', () => ({ json: s.interviews }));
    this.on('GET', `/api/v1/interview/${ONGOING_ID}`, () => ({ json: ongoingDetail() }));
    this.on('DELETE', /^\/api\/v1\/interview\/[^/]+$/, ({ url }) => {
      const id = url.pathname.split('/').pop();
      s.interviews = s.interviews.filter((i) => i.id !== id);
      return { json: { ok: true } };
    });
    this.on('GET', '/api/v1/progress/me', { json: PROGRESS });
    // Yarıda kalan mülakatın video analizi yok: gerçek backend de 404 döner.
    this.on('GET', /^\/api\/v1\/analytics\/(results|status)\/[^/]+$/, { status: 404, json: { detail: 'Analiz bulunamadı.' } });
    installCareer(this, this.career);
  }

  /** CV, ilan, kurum ve ödev için örnek veriyi yükler (varsayılan: hepsi boş, CV rızası yok). */
  seedCareer(): this {
    seedCareer(this.career);
    return this;
  }
}

/** Web: proxy (src/proxy.ts) yalnızca `token` çerezine bakar; profil taklit backend'den gelir. */
export async function signInWeb(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: 'token', value: 'e2e-token', url: baseURL }]);
}

/** Mobil (Expo web): oturum localStorage'da tutulur. */
export async function signInMobile(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'e2e-token');
    window.localStorage.setItem('refresh_token', 'e2e-refresh');
  });
}

type Fixtures = {
  api: MockApi;
  /** Oturum açık sayfa (taklit kullanıcı). */
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  api: async ({ context }, use) => {
    const api = new MockApi();
    await api.attach(context);
    await use(api);
    if (api.unhandled.length) {
      // Testi düşürmez; yeni bir uç nokta eklendiğinde taklidin güncellenmesi için iz bırakır.
      console.warn(`[e2e] taklit edilmeyen istekler: ${[...new Set(api.unhandled)].join(', ')}`);
    }
  },
  authedPage: async ({ page, context, api, baseURL }, use, testInfo) => {
    void api; // taklit, sayfa açılmadan önce bağlanmış olmalı
    if (testInfo.project.name === 'mobile') await signInMobile(page);
    else await signInWeb(context, baseURL!);
    await use(page);
  },
});

export { expect };
