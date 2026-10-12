import { api } from "../lib/api";

export interface PendingSurvey {
  id: string;
  role: string | null;
  topic: string | null;
  created_at: string | null;
}

export interface PilotStatus {
  consent: boolean;
  consent_text: string;
  consent_version: string;
  sus_items: string[];
  post_items: { key: PostItemKey; label: string }[];
  completed_interviews: number;
  sus_score: number | null;
  pending_surveys: PendingSurvey[];
}

export type PostItemKey = "useful" | "realistic" | "feedback_clear";

export interface PairedStats {
  n: number;
  mean_pre: number | null;
  mean_post: number | null;
  mean_delta: number | null;
  improved: number;
  declined: number;
  t: number | null;
  p_ttest: number | null;
  p_wilcoxon: number | null;
  cohens_dz: number | null;
}

export interface PilotRow {
  participant: string;
  interviews: number;
  first: number | null;
  last: number | null;
  delta: number | null;
  first2: number | null;
  last2: number | null;
  sus: number | null;
  post_surveys: number;
}

export interface PilotReport {
  participants: number;
  with_pre_post: number;
  first_last: PairedStats;
  first2_last2: PairedStats;
  sus: { n: number; mean: number | null; grade: string | null };
  post_interview: { n: number; items: { key: PostItemKey; label: string; mean: number | null }[] };
  rows: PilotRow[];
}

function extractErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { detail?: unknown } }; message?: string };
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

export const pilotService = {
  status: () => call<PilotStatus>(api.get("/api/v1/pilot/me")),
  setConsent: (granted: boolean) => call<{ consent: boolean }>(api.put("/api/v1/pilot/me/consent", { granted })),
  submitPostInterview: (interviewId: string, answers: Record<PostItemKey, number>, comment?: string) =>
    call<{ status: string }>(api.post("/api/v1/pilot/surveys/post-interview", { interview_id: interviewId, answers, comment: comment || undefined })),
  submitSus: (answers: number[]) => call<{ score: number; grade: string }>(api.post("/api/v1/pilot/surveys/sus", { answers })),
  report: () => call<PilotReport>(api.get("/api/v1/pilot/report")),
  async downloadReportCsv(): Promise<void> {
    const blob = await call<Blob>(api.get("/api/v1/pilot/report.csv", { responseType: "blob" }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pilot-raporu.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};
