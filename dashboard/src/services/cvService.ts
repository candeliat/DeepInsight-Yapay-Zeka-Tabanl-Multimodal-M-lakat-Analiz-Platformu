import { api } from "../lib/api";

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
  extraction_method: "pdf_text" | "ocr" | "docx" | null;
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
  seniority: "JUNIOR" | "ORTA" | "UZMAN" | null;
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
  status: "pass" | "partial" | "fail";
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

function extractErrorMessage(error: unknown): string {
  const e = error as { response?: { status?: number; data?: { detail?: unknown } }; message?: string };
  const detail = e.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return e.message ?? "Bilinmeyen bir hata oluştu.";
}

async function call<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    return (await request).data;
  } catch (error: unknown) {
    throw new Error(extractErrorMessage(error));
  }
}

export const cvService = {
  getConsent: () => call<ConsentStatus>(api.get("/api/v1/cv/consent")),
  grantConsent: () => call<ConsentStatus>(api.post("/api/v1/cv/consent")),
  /** Rızayı geri çeker; yüklenmiş tüm CV'ler de silinir. */
  revokeConsent: () => call<{ status: string; deleted_cvs: number }>(api.delete("/api/v1/cv/consent")),

  listCvs: () => call<CVItem[]>(api.get("/api/v1/cv")),
  getCv: (id: string) => call<CVDetail>(api.get(`/api/v1/cv/${id}`)),
  deleteCv: (id: string) => call<{ status: string }>(api.delete(`/api/v1/cv/${id}`)),

  uploadCv(file: File): Promise<CVItem> {
    const form = new FormData();
    form.append("file", file);
    return call<CVItem>(api.post("/api/v1/cv", form, { headers: { "Content-Type": "multipart/form-data" } }));
  },

  /** ATS skoru + (best-effort) LLM profil çıkarma. */
  analyzeCv: (id: string) => call<CVAnalysis>(api.post(`/api/v1/cv/${id}/analyze`)),

  /** Son analizi getirir; henüz analiz yoksa null döner (404 hata olarak fırlatılmaz). */
  async getLatestAnalysis(id: string): Promise<CVAnalysis | null> {
    try {
      return (await api.get<CVAnalysis>(`/api/v1/cv/${id}/analysis`)).data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) return null;
      throw new Error(extractErrorMessage(error));
    }
  },
};
