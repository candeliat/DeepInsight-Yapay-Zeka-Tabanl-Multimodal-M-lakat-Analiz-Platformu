import { api } from "../lib/api";
import { extractErrorMessage, call } from "../lib/apiError";

export interface JobRequirements {
  title: string | null;
  company: string | null;
  seniority: "JUNIOR" | "ORTA" | "UZMAN" | null;
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
  status: "matched" | "in_text" | "missing";
  matched_with: string | null;
}

export interface MatchComponent {
  id: string;
  label: string;
  weight: number;
  earned: number;
}

export interface RoadmapItem {
  skill: string;
  priority: "yüksek" | "orta";
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
    experience: { required_min: number | null; candidate_years: number | null; status: "meets" | "close" | "below" | "unknown" | "n/a" };
    components: MatchComponent[];
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

export const jobService = {
  /** İlan metnini kaydeder; gereksinimler yapay zekâ ile çıkarılır. */
  createJob: (payload: { text: string; title?: string; company?: string }) =>
    call<JobDetail>(api.post("/api/v1/jobs", payload)),
  listJobs: () => call<JobItem[]>(api.get("/api/v1/jobs")),
  getJob: (id: string) => call<JobDetail>(api.get(`/api/v1/jobs/${id}`)),
  deleteJob: (id: string) => call<{ status: string }>(api.delete(`/api/v1/jobs/${id}`)),

  /** İlanı bir CV ile eşleştirir (skor deterministik; yol haritası yapay zekâ ile). */
  matchJob: (jobId: string, cvId: string) => call<JobMatch>(api.post(`/api/v1/jobs/${jobId}/match`, { cv_id: cvId })),

  /** Son eşleştirmeyi getirir; yoksa null döner. */
  async getLatestMatch(jobId: string, cvId: string): Promise<JobMatch | null> {
    try {
      return (await api.get<JobMatch>(`/api/v1/jobs/${jobId}/match`, { params: { cv_id: cvId } })).data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) return null;
      throw new Error(extractErrorMessage(error));
    }
  },
};
