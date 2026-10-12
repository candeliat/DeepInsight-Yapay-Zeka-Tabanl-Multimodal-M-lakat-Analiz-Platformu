import {
  CV_CONSENT_TEXT, CV_ID, cvAnalysis, cvItem, JOB_ID, jobItem, jobMatch, MY_ASSIGNMENTS, MY_INVITES, MY_ORGS,
  ORG_DETAIL, ORG_MEMBERS, ORG_OVERVIEW,
} from './data';
import type { MockApi, Reply } from './api';

/** CV, ilan, kurum ve ödev durumu. Varsayılan boştur; `seedCareer` örnek veriyi yükler. */
export function careerState() {
  return {
    cvConsent: false,
    cvs: [] as ReturnType<typeof cvItem>[],
    analyses: {} as Record<string, ReturnType<typeof cvAnalysis>>,
    jobs: [] as ReturnType<typeof jobItem>[],
    matches: {} as Record<string, ReturnType<typeof jobMatch>>,
    orgs: [] as { id: string; name: string; created_at: string | null; role: string; share_progress: boolean }[],
    invites: [] as typeof MY_INVITES,
    assignments: [] as typeof MY_ASSIGNMENTS,
    orgAssignments: [] as Record<string, unknown>[],
    inviteCode: ORG_DETAIL.invite_code,
  };
}
export type CareerState = ReturnType<typeof careerState>;

/** Rıza verili + analizli bir CV, eşleştirilmemiş bir ilan, iki kurum (öğrenci + yönetici), bekleyen davet, iki ödev. */
export function seedCareer(c: CareerState) {
  c.cvConsent = true;
  c.cvs = [cvItem(CV_ID, 'Ece_Deneme_CV.pdf')];
  c.analyses = { [CV_ID]: cvAnalysis(CV_ID) };
  c.jobs = [jobItem(JOB_ID, 'Frontend Developer', 'Lumen Yazılım')];
  c.orgs = structuredClone(MY_ORGS);
  c.invites = structuredClone(MY_INVITES);
  c.assignments = structuredClone(MY_ASSIGNMENTS);
}

const notFound = (detail: string): Reply => ({ status: 404, json: { detail } });
/** /api/v1/<segment...> yolunun n. parçası (0 = "api"). */
const seg = (url: URL, n: number) => url.pathname.split('/').filter(Boolean)[n];
const path = (pattern: string) => new RegExp(`^/api/v1/${pattern}$`);
const ID = '[^/]+';

/** Genel kalıplar önce, özel yollar sonra eklenir: MockApi'de sonra eklenen önce eşleşir. */
export function installCareer(api: MockApi, c: CareerState) {
  const cvConsent = () => ({ json: { consent_type: 'cv_processing', version: '2026-10-v1', text: CV_CONSENT_TEXT, granted: c.cvConsent } });

  // --- CV ---
  api.on('GET', path(`cv/${ID}`), ({ url }) => {
    const cv = c.cvs.find((x) => x.id === seg(url, 3));
    return cv ? { json: { ...cv, extracted_text: 'e2e', profile: c.analyses[cv.id]?.profile ?? null } } : notFound('CV bulunamadı');
  });
  api.on('DELETE', path(`cv/${ID}`), ({ url }) => {
    c.cvs = c.cvs.filter((x) => x.id !== seg(url, 3));
    return { json: { status: 'deleted' } };
  });
  api.on('GET', path(`cv/${ID}/analysis`), ({ url }) => {
    const a = c.analyses[seg(url, 3)];
    return a ? { json: a } : notFound('Bu CV için henüz analiz yapılmadı');
  });
  api.on('POST', path(`cv/${ID}/analyze`), ({ url }) => {
    const id = seg(url, 3);
    c.analyses[id] = cvAnalysis(id);
    return { json: c.analyses[id] };
  });
  api.on('GET', path('cv'), () => ({ json: c.cvConsent ? c.cvs : [] }));
  api.on('POST', path('cv'), ({ req }) => {
    if (!c.cvConsent) return { status: 403, json: { detail: 'CV yüklemek için açık rıza gerekli.' } };
    if (c.cvs.length >= 5) return { status: 409, json: { detail: 'En fazla 5 CV saklayabilirsiniz. Önce birini silin.' } };
    const raw = req.postDataBuffer()?.toString('latin1') ?? '';
    const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? 'cv.pdf';
    const created = cvItem(`cv-${c.cvs.length + 2}`, Buffer.from(name, 'latin1').toString('utf8'));
    c.cvs = [created, ...c.cvs];
    return { json: created };
  });
  api.on('GET', path('cv/consent'), cvConsent);
  api.on('POST', path('cv/consent'), () => {
    c.cvConsent = true;
    return cvConsent();
  });
  api.on('DELETE', path('cv/consent'), () => {
    const deleted = c.cvs.length;
    c.cvConsent = false;
    c.cvs = [];
    c.analyses = {};
    return { json: { status: 'revoked', deleted_cvs: deleted } };
  });

  // --- İlanlar ---
  api.on('GET', path(`jobs/${ID}`), ({ url }) => {
    const job = c.jobs.find((j) => j.id === seg(url, 3));
    return job ? { json: job } : notFound('İlan bulunamadı');
  });
  api.on('DELETE', path(`jobs/${ID}`), ({ url }) => {
    c.jobs = c.jobs.filter((j) => j.id !== seg(url, 3));
    return { json: { status: 'deleted' } };
  });
  api.on('GET', path(`jobs/${ID}/match`), ({ url }) => {
    const m = c.matches[`${seg(url, 3)}:${url.searchParams.get('cv_id')}`];
    return m ? { json: m } : notFound('Eşleştirme yok');
  });
  api.on('POST', path(`jobs/${ID}/match`), ({ url, body }) => {
    const m = jobMatch(seg(url, 3), body.cv_id);
    c.matches[`${m.job_id}:${m.cv_id}`] = m;
    return { json: m };
  });
  api.on('GET', path('jobs'), () => ({ json: c.jobs }));
  api.on('POST', path('jobs'), ({ body }) => {
    const job = { ...jobItem(`job-${c.jobs.length + 2}`, body.title ?? 'Frontend Developer', body.company ?? null), raw_text: body.text };
    c.jobs = [job, ...c.jobs];
    return { json: job };
  });

  // --- Kurum paneli (yönetici) — genel `organizations/{id}` kalıpları önce ---
  const org = (suffix = '') => path(`organizations/${ID}${suffix}`);
  api.on('GET', org(), () => ({ json: { ...ORG_DETAIL, invite_code: c.inviteCode } }));
  api.on('GET', org('/overview'), { json: ORG_OVERVIEW });
  api.on('GET', org('/members'), { json: ORG_MEMBERS });
  api.on('GET', org('/groups'), { json: [] });
  api.on('GET', org('/invites'), { json: [] });
  api.on('GET', org('/assignments'), () => ({ json: c.orgAssignments }));
  api.on('POST', org('/assignments'), ({ url, body }) => {
    const created = {
      id: `as-new-${c.orgAssignments.length + 1}`, org_id: seg(url, 3), group_id: null, created_at: null,
      due_at: null, instructions: null, total_candidates: 2, ...body,
    };
    c.orgAssignments = [created, ...c.orgAssignments];
    return { json: created };
  });
  api.on('POST', org('/invite-code/rotate'), () => {
    c.inviteCode = 'BOOT-YENI';
    return { json: { invite_code: c.inviteCode } };
  });
  api.on('POST', org('/invites'), ({ body }) => {
    const rows: { email: string }[] = body.rows ?? [];
    const ok = (r: { email: string }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email);
    return { json: { invited: rows.filter(ok).length, already_member: [], invalid: rows.filter((r) => !ok(r)).map((r) => r.email), truncated: 0 } };
  });
  api.on('PUT', org('/me/sharing'), ({ url, body }) => {
    const o = c.orgs.find((x) => x.id === seg(url, 3));
    if (o) o.share_progress = !!body.share_progress;
    return { json: { share_progress: !!body.share_progress } };
  });

  // --- Kurumlar: öğrenci tarafı (özel yollar en son) ---
  api.on('GET', path('organizations/me'), () => ({ json: c.orgs }));
  api.on('GET', path('organizations/invites/me'), () => ({ json: c.invites }));
  api.on('POST', path(`organizations/invites/${ID}/(accept|decline)`), ({ url }) => {
    const inv = c.invites.find((i) => i.id === seg(url, 4));
    const accept = url.pathname.endsWith('/accept');
    c.invites = c.invites.filter((i) => i !== inv);
    if (inv && accept) c.orgs.push({ id: inv.org_id, name: inv.org_name ?? 'Kurum', created_at: null, role: inv.role, share_progress: false });
    return { json: { org_id: inv?.org_id, accepted: accept } };
  });
  api.on('POST', path('organizations/join'), ({ body }) => {
    if (body.invite_code !== 'KATIL-2026') return notFound('Geçersiz davet kodu');
    c.orgs.push({ id: 'org-katil', name: 'Katılım Akademisi', created_at: null, role: 'candidate', share_progress: false });
    return { json: { id: 'org-katil', name: 'Katılım Akademisi' } };
  });
  api.on('GET', path('assignments/me'), () => ({ json: c.assignments }));
}
