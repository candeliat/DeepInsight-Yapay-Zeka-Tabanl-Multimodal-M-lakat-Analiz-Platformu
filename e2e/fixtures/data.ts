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
