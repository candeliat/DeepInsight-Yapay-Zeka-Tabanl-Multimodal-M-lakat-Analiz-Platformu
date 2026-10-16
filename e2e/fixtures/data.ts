/** Taklit backend'in varsayılan verisi. Gerçek kişi verisi değildir. */

export const USER = {
  id: 'user-e2e',
  email: 'e2e.aday@example.com',
  created_at: '2026-09-01T10:00:00+00:00',
  user_metadata: { first_name: 'Ece', last_name: 'Deneme', target: 'Frontend Geliştirici', email_verified: true },
  app_metadata: { provider: 'email', providers: ['email'] },
};

export const CONSENT_TEXT =
  'Görüntülü mülakatta kameranızın ve mikrofonunuzun kaydı analiz için sunucularımıza yüklenir. (e2e)';

export const consent = (granted: boolean) => ({
  consent_type: 'video_analysis',
  version: '2026-10-v1',
  text: CONSENT_TEXT,
  granted,
});

export const ONGOING_ID = 'int-ongoing';
export const FIRST_QUESTION = 'React uygulamasında global durumu nasıl yönetirsiniz?';
export const NEXT_QUESTION = 'Server Component ile Client Component farkı nedir?';

const interview = (id: string, status: string, avg: number | null, created: string, role = 'Frontend Geliştirici', topic = 'React') => ({
  id,
  user_id: USER.id,
  role,
  topic,
  difficulty: 'Orta',
  status,
  technical_score: avg ?? 0,
  confidence_score: avg ?? 0,
  vocabulary_score: avg ?? 0,
  average_score: avg,
  objective_confidence_pct: null,
  created_at: created,
});

/** Her skor bandından bir tamamlanmış mülakat + bir yarıda kalan (en yenisi). */
export const INTERVIEWS = [
  interview(ONGOING_ID, 'ongoing', null, '2026-10-12T09:00:00+00:00', 'Frontend Geliştirici', 'React ve TypeScript'),
  interview('int-strong', 'completed', 85, '2026-10-10T09:00:00+00:00'),
  interview('int-growing', 'completed', 72, '2026-10-05T09:00:00+00:00'),
  interview('int-weak', 'completed', 45, '2026-10-01T09:00:00+00:00'),
];

export const ongoingDetail = () => ({
  ...INTERVIEWS[0],
  feedback: null,
  messages: [
    { role: 'user', content: 'Mülakatı başlat.' },
    { role: 'model', content: FIRST_QUESTION },
  ],
});

export const PROGRESS = {
  completed_count: 3,
  timeline: [],
  trend: {
    technical: { recent: 67, previous: 60, delta: 7 },
    confidence: { recent: 67, previous: 60, delta: 7 },
    vocabulary: { recent: 67, previous: 60, delta: 7 },
    average: { recent: 67, previous: 60, delta: 7 },
  },
  metric_means: { technical: 67, confidence: 67, vocabulary: 67 },
  strongest: 'technical',
  weakest: 'confidence',
  topics: [],
  video: null,
  recommendations: [],
};

/** SSE gövdesi: soru parça parça akar, sonra "done". */
export function sseBody(text: string, complete = false): string {
  const words = text.split(' ');
  const chunks = words.map((w, i) => `event: chunk\ndata: ${JSON.stringify(i === 0 ? w : ' ' + w)}\n\n`);
  return chunks.join('') + `event: done\ndata: ${JSON.stringify({ interview_complete: complete, evaluation: null })}\n\n`;
}

/** backend/app/api/routes/auth.py forgot_password yanıtı (hesap varlığını sızdırmaz). */
export const FORGOT_MESSAGE = 'Bu e-postayla kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi.';

// ---------------------------------------------------------------------------
// CV, ilan, kurum ve ödev verisi (seedCareer ile yüklenir; varsayılan durum boştur).
// ---------------------------------------------------------------------------

export const CV_CONSENT_TEXT = 'CV’nizdeki kişisel verileriniz ATS analizi ve mülakat kişiselleştirme için işlenir. (e2e)';
export const CV_ID = 'cv-1';
export const JOB_ID = 'job-1';
export const ORG_CANDIDATE = 'org-okul';
export const ORG_ADMIN = 'org-bootcamp';

export const cvItem = (id: string, filename: string) => ({
  id,
  org_id: null,
  original_filename: filename,
  mime_type: 'application/pdf',
  size_bytes: 182_000,
  extraction_method: 'pdf_text',
  status: 'ready',
  created_at: '2026-10-01T10:00:00+00:00',
});

export const CV_PROFILE = {
  full_name: 'Ece Deneme',
  location: 'İstanbul',
  summary: 'Frontend geliştirici.',
  skills: ['React', 'TypeScript', 'Redux'],
  languages: ['Türkçe', 'İngilizce'],
  education: [{ school: 'Örnek Üniversitesi', degree: 'Lisans', field: 'Bilgisayar Mühendisliği' }],
  experience: [{ company: 'Örnek Yazılım', title: 'Frontend Developer', start: '2023', end: '2026' }],
  projects: [],
  certifications: [],
  seniority: 'ORTA',
  experience_years: 3,
  target_roles: ['Frontend Geliştirici'],
  improvement_tips: [],
};

export const cvAnalysis = (cvId: string) => ({
  cv_id: cvId,
  analysis_id: `an-${cvId}`,
  ats_score: 78,
  breakdown: [
    { id: 'text_layer', label: 'Makine tarafından okunabilir metin', weight: 25, earned: 25, status: 'pass', detail: 'PDF metin katmanı var.', tip: null },
    { id: 'headings', label: 'Standart bölüm başlıkları', weight: 20, earned: 12, status: 'partial', detail: '"Projeler" başlığı bulunamadı.', tip: 'Projeler başlığı ekleyin.' },
    { id: 'contact', label: 'İletişim bilgisi', weight: 15, earned: 0, status: 'fail', detail: 'Telefon bulunamadı.', tip: 'Telefon numaranızı ekleyin.' },
  ],
  suggestions: ['Deneyim maddelerini ölçülebilir sonuçlarla yazın.'],
  profile: CV_PROFILE,
  profile_error: null,
  created_at: '2026-10-01T10:05:00+00:00',
});

export const JOB_REQUIREMENTS = {
  title: 'Frontend Developer',
  company: 'Lumen Yazılım',
  seniority: 'ORTA',
  min_years_experience: 2,
  required_skills: ['React', 'TypeScript', 'Testing'],
  nice_to_have_skills: ['Next.js'],
  responsibilities: ['Arayüz geliştirme'],
  languages: [],
};

export const jobItem = (id: string, title: string | null, company: string | null) => ({
  id,
  title,
  company,
  requirements: { ...JOB_REQUIREMENTS, title, company },
  created_at: '2026-10-02T10:00:00+00:00',
  raw_text: 'Frontend Developer arıyoruz. React, TypeScript ve test yazma deneyimi şart; Next.js artı. (e2e)',
});

export const jobMatch = (jobId: string, cvId: string) => ({
  match_id: `m-${jobId}-${cvId}`,
  job_id: jobId,
  cv_id: cvId,
  match_score: 64,
  breakdown: {
    required: [
      { skill: 'React', status: 'matched', matched_with: 'React' },
      { skill: 'TypeScript', status: 'in_text', matched_with: null },
      { skill: 'Testing', status: 'missing', matched_with: null },
    ],
    nice_to_have: [{ skill: 'Next.js', status: 'missing', matched_with: null }],
    experience: { required_min: 2, candidate_years: 3, status: 'meets' },
    components: [
      { id: 'required', label: 'Zorunlu beceriler', weight: 70, earned: 46.7 },
      { id: 'nice', label: 'Tercih edilenler', weight: 15, earned: 2.3 },
      { id: 'experience', label: 'Deneyim', weight: 15, earned: 15 },
    ],
    missing_required: ['Testing'],
    missing_nice: ['Next.js'],
    underlisted: ['TypeScript'],
    interview_focus: ['React performansı', 'Birim testi'],
  },
  roadmap: [
    { skill: 'Testing', priority: 'yüksek', why: 'İlanda zorunlu.', steps: ['Jest temellerini öğrenin.', 'Bir bileşene test yazın.'], est_weeks: 2 },
  ],
  summary: 'React deneyiminiz güçlü; test yazma eksik.',
  llm_error: null,
  created_at: '2026-10-02T10:05:00+00:00',
});

export const MY_ORGS = [
  { id: ORG_CANDIDATE, name: 'Örnek Üniversitesi Kariyer Merkezi', created_at: '2026-09-01T00:00:00+00:00', role: 'candidate', share_progress: false },
  { id: ORG_ADMIN, name: 'Örnek Bootcamp', created_at: '2026-09-01T00:00:00+00:00', role: 'org_admin', share_progress: false },
];

export const MY_INVITES = [{ id: 'inv-1', org_id: 'org-yeni', org_name: 'Yeni Akademi', role: 'candidate', created_at: '2026-10-10T00:00:00+00:00' }];

export const MY_ASSIGNMENTS = [
  {
    id: 'as-todo', org_id: ORG_CANDIDATE, title: 'React haftalık pratik', role: 'Frontend Developer', topic: 'React',
    difficulty: 'ORTA', instructions: 'Hook kurallarına odaklanın.', due_at: '2026-12-01T18:00:00+00:00', group_id: null,
    created_at: '2026-10-01T00:00:00+00:00', org_name: 'Örnek Üniversitesi Kariyer Merkezi', status: 'not_started',
    my_score: null, interview_id: null, overdue: false,
  },
  {
    id: 'as-done', org_id: ORG_CANDIDATE, title: 'Veri yapıları tekrarı', role: 'Backend Developer', topic: 'Veri Yapıları',
    difficulty: 'JUNIOR', instructions: null, due_at: null, group_id: null, created_at: '2026-09-15T00:00:00+00:00',
    org_name: 'Örnek Üniversitesi Kariyer Merkezi', status: 'completed', my_score: 82.4, interview_id: 'int-strong', overdue: false,
  },
];

export const NOTIFICATIONS = [
  {
    id: 'n-due', kind: 'assignment_due_soon', title: 'Son tarih yaklaşıyor: React haftalık pratik',
    body: 'Son tarih: 01.12.2026 21:00. Ödevi henüz tamamlamadınız.', link: '/assignments', assignment_id: 'as-todo',
    read_at: null, created_at: '2026-10-16T09:00:00+00:00',
  },
  {
    id: 'n-new', kind: 'assignment_new', title: 'Yeni ödev: React haftalık pratik',
    body: 'Örnek Üniversitesi Kariyer Merkezi · Frontend Developer / React', link: '/assignments', assignment_id: 'as-todo',
    read_at: null, created_at: '2026-10-01T09:00:00+00:00',
  },
  {
    id: 'n-old', kind: 'assignment_reminder', title: 'Eğitmen hatırlatması: Veri yapıları tekrarı',
    body: 'Örnek Üniversitesi Kariyer Merkezi ödevi henüz tamamlanmadı', link: '/assignments', assignment_id: 'as-done',
    read_at: '2026-09-20T09:00:00+00:00', created_at: '2026-09-18T09:00:00+00:00',
  },
];

export const ORG_OVERVIEW = {
  org: { id: ORG_ADMIN, name: 'Örnek Bootcamp', monthly_interview_quota: 100, rubric: null },
  member_counts: { org_admin: 1, candidate: 2 },
  completed_count: 5,
  contributors: 2,
  active_students_30d: 2,
  month_interviews: 5,
  min_cohort: 3,
  aggregates_available: false,
  metric_means: {},
  weekly: [],
  topics: [],
};

export const ORG_MEMBERS = [
  { user_id: USER.id, role: 'org_admin', created_at: null, email: USER.email, name: 'Ece Deneme', share_progress: false, group_id: null, interview_count: 0, last_interview_at: null, average: null },
  { user_id: 'stu-1', role: 'candidate', created_at: null, email: 'ali@example.com', name: 'Ali Öğrenci', share_progress: true, group_id: null, interview_count: 3, last_interview_at: '2026-10-09T00:00:00+00:00', average: 74.4 },
  { user_id: 'stu-2', role: 'candidate', created_at: null, email: 'ayse@example.com', name: 'Ayşe Öğrenci', share_progress: false, group_id: null, interview_count: 2, last_interview_at: '2026-10-08T00:00:00+00:00', average: null },
];

export const ORG_DETAIL = { id: ORG_ADMIN, name: 'Örnek Bootcamp', created_at: null, invite_code: 'BOOT-2026', monthly_interview_quota: 100, rubric: null };
