/**
 * CV, ilan eşleştirme ve gelişim servisleri. Tipler dashboard'daki
 * (dashboard/src/services/{cv,job,progress}Service.ts) ile aynıdır — iki istemci
 * aynı backend sözleşmesini kullanır.
 */
import { Platform } from 'react-native';
import { api, call, callOrNull } from '../config/api';
import { downloadAndShare } from '../utils/download';

export type Level = 'JUNIOR' | 'ORTA' | 'UZMAN';

// --- CV ---

export interface ConsentStatus {
  consent_type: string;
  version: string;
  text: string;
  granted: boolean;
}

export interface CVItem {
  id: string;
  org_id: string | null;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_method: 'pdf_text' | 'ocr' | 'docx' | null;
  status: string;
  created_at: string | null;
}

export interface CVProfile {
  full_name: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  languages: string[];
  education: { school?: string; degree?: string; field?: string; start?: string; end?: string }[];
  experience: { company?: string; title?: string; start?: string; end?: string; bullets?: string[] }[];
  projects: { name?: string; description?: string; tech?: string[] }[];
  certifications: string[];
  seniority: Level | null;
  experience_years?: number | null;
  target_roles: string[];
  improvement_tips: string[];
}

export interface CVDetail extends CVItem {
  extracted_text: string | null;
  profile: CVProfile | null;
}

export interface ATSCheck {
  id: string;
  label: string;
  weight: number;
  earned: number;
  status: 'pass' | 'partial' | 'fail';
  detail: string;
  tip: string | null;
}

export interface CVAnalysis {
  cv_id: string;
  analysis_id: string | null;
  ats_score: number;
  breakdown: ATSCheck[];
  suggestions: string[];
  profile: CVProfile | null;
  profile_error: string | null;
  created_at: string | null;
}

/** Seçilen dosya: cihazda uri, web'de File nesnesi. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  file?: File;
}

export const cvService = {
  getConsent: () => call<ConsentStatus>(api.get('/api/v1/cv/consent')),
  grantConsent: () => call<ConsentStatus>(api.post('/api/v1/cv/consent')),
  revokeConsent: () => call<{ status: string; deleted_cvs: number }>(api.delete('/api/v1/cv/consent')),
  listCvs: () => call<CVItem[]>(api.get('/api/v1/cv')),
  getCv: (id: string) => call<CVDetail>(api.get(`/api/v1/cv/${id}`)),
  deleteCv: (id: string) => call<{ status: string }>(api.delete(`/api/v1/cv/${id}`)),

  uploadCv(file: PickedFile): Promise<CVItem> {
    const form = new FormData();
    if (Platform.OS === 'web' && file.file) {
      form.append('file', file.file);
    } else {
      // React Native FormData dosyayı uri üzerinden akıtır (belleğe okumadan).
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    }
    return call<CVItem>(api.post('/api/v1/cv', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // taranmış CV'de OCR uzun sürebilir
    }));
  },

  analyzeCv: (id: string) => call<CVAnalysis>(api.post(`/api/v1/cv/${id}/analyze`, undefined, { timeout: 120000 })),
  getLatestAnalysis: (id: string) => callOrNull<CVAnalysis>(api.get(`/api/v1/cv/${id}/analysis`)),
};

// --- İlanlar ---

export interface JobRequirements {
  title: string | null;
  company: string | null;
  seniority: Level | null;
  min_years_experience: number | null;
  required_skills: string[];
  nice_to_have_skills: string[];
  responsibilities: string[];
  languages: string[];
}

export interface JobItem {
  id: string;
  title: string | null;
  company: string | null;
  requirements: JobRequirements;
  created_at: string | null;
}

export interface JobDetail extends JobItem {
  raw_text: string;
}

export interface SkillMatch {
  skill: string;
  status: 'matched' | 'in_text' | 'missing';
  matched_with: string | null;
}

export interface RoadmapItem {
  skill: string;
  priority: 'yüksek' | 'orta';
  why: string;
  steps: string[];
  est_weeks: number;
}

export interface JobMatch {
  match_id: string | null;
  job_id: string;
  cv_id: string;
  match_score: number;
  breakdown: {
    required: SkillMatch[];
    nice_to_have: SkillMatch[];
    experience: { required_min: number | null; candidate_years: number | null; status: 'meets' | 'close' | 'below' | 'unknown' | 'n/a' };
    components: { id: string; label: string; weight: number; earned: number }[];
    missing_required: string[];
    missing_nice: string[];
    underlisted: string[];
    interview_focus: string[];
  };
  roadmap: RoadmapItem[];
  summary: string | null;
  llm_error: string | null;
  created_at: string | null;
}

export interface CoverLetter {
  subject: string;
  body: string;
  language: 'tr' | 'en';
  tone: 'resmi' | 'samimi';
  highlighted_skills: string[];
  /** CV'de dayanağı olmayan sayılar ya da CV'de görünmeyen ilan becerileri. */
  warnings: string[];
  word_count: number;
}

export const jobService = {
  createJob: (payload: { text: string; title?: string; company?: string }) =>
    call<JobDetail>(api.post('/api/v1/jobs', payload, { timeout: 90000 })),
  listJobs: () => call<JobItem[]>(api.get('/api/v1/jobs')),
  getJob: (id: string) => call<JobDetail>(api.get(`/api/v1/jobs/${id}`)),
  deleteJob: (id: string) => call<{ status: string }>(api.delete(`/api/v1/jobs/${id}`)),
  matchJob: (jobId: string, cvId: string) =>
    call<JobMatch>(api.post(`/api/v1/jobs/${jobId}/match`, { cv_id: cvId }, { timeout: 90000 })),
  /** İlana ve CV'ye özel ön yazı taslağı (kaydedilmez). */
  coverLetter: (jobId: string, payload: { cv_id: string; language: 'tr' | 'en'; tone: 'resmi' | 'samimi'; note?: string }) =>
    // Model başına 110 sn deneme; ilk model düşüp yedeğe geçerse daha da uzayabilir.
    call<CoverLetter>(api.post(`/api/v1/jobs/${jobId}/cover-letter`, payload, { timeout: 240000 })),
  getLatestMatch: (jobId: string, cvId: string) =>
    callOrNull<JobMatch>(api.get(`/api/v1/jobs/${jobId}/match`, { params: { cv_id: cvId } })),
};

// --- Gelişim ---

export type MetricKey = 'technical' | 'confidence' | 'vocabulary';

export interface TimelinePoint {
  id: string;
  date: string | null;
  role: string | null;
  topic: string | null;
  difficulty: string | null;
  technical: number | null;
  confidence: number | null;
  confidence_source: 'video' | 'text';
  vocabulary: number | null;
  average: number;
}

export interface TopicStat {
  topic: string;
  role: string | null;
  difficulty: string | null;
  count: number;
  average: number | null;
  weak: boolean;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  action: { role: string | null; topic: string | null; difficulty: string | null } | null;
}

export interface Progress {
  completed_count: number;
  timeline: TimelinePoint[];
  trend: Record<MetricKey | 'average', { recent: number | null; previous: number | null; delta: number | null }> | null;
  metric_means: Partial<Record<MetricKey, number | null>>;
  strongest: MetricKey | null;
  weakest: MetricKey | null;
  topics: TopicStat[];
  recommendations: Recommendation[];
}

export const METRIC_LABEL: Record<MetricKey, string> = {
  technical: 'Teknik bilgi',
  confidence: 'Özgüven',
  vocabulary: 'İletişim',
};

export const progressService = {
  getMyProgress: () => call<Progress>(api.get('/api/v1/progress/me')),
  shareReport: () => downloadAndShare('/api/v1/progress/me/report.pdf', 'deepinsight-gelisim-raporu.pdf', 'application/pdf'),
};
