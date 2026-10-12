import { api } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

export type MetricKey = "technical" | "confidence" | "vocabulary";

export interface TimelinePoint {
  id: string;
  date: string | null;
  role: string | null;
  topic: string | null;
  difficulty: string | null;
  technical: number | null;
  confidence: number | null;
  confidence_source: "video" | "text";
  vocabulary: number | null;
  average: number;
  eye_contact_pct: number | null;
  filler_word_count: number | null;
  speech_rate_wpm: number | null;
  pause_count: number | null;
}

export interface TrendValue {
  recent: number | null;
  previous: number | null;
  delta: number | null;
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
  trend: Record<MetricKey | "average", TrendValue> | null;
  metric_means: Partial<Record<MetricKey, number | null>>;
  strongest: MetricKey | null;
  weakest: MetricKey | null;
  topics: TopicStat[];
  video: {
    count: number;
    eye_contact_pct: number | null;
    filler_word_count: number | null;
    speech_rate_wpm: number | null;
    pause_count: number | null;
  } | null;
  recommendations: Recommendation[];
}

export const progressService = {
  async getMyProgress(): Promise<Progress> {
    try {
      return (await api.get<Progress>("/api/v1/progress/me")).data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  /** PDF raporunu indirir (yetkili istek + blob; düz bağlantı Authorization başlığı taşıyamaz). */
  async downloadReport(): Promise<void> {
    try {
      const response = await api.get("/api/v1/progress/me/report.pdf", { responseType: "blob" });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "deepinsight-gelisim-raporu.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },
};
