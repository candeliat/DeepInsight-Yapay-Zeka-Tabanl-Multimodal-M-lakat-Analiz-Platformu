import { api } from "../lib/api";

export interface QuestionBankItem {
  id: string;
  role: string;
  topic: string;
  difficulty: string | null;
  question_text: string;
  tags: string[];
  family_id: string | null;
  times_served: number;
  is_active: boolean;
  created_at: string | null;
}

export interface QuestionBankGapItem {
  id: string;
  role: string;
  topic: string;
  difficulty: string | null;
  miss_count: number;
  last_missing_count: number;
  last_seen_at: string | null;
}

export interface CreateQuestionPayload {
  role: string;
  topic: string;
  difficulty?: string;
  question_text: string;
  tags?: string[];
  family_id?: string;
  new_family?: boolean;
}

export interface UpdateQuestionPayload {
  role?: string;
  topic?: string;
  difficulty?: string;
  question_text?: string;
  tags?: string[];
  is_active?: boolean;
}

function extractErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return e.message ?? "Bilinmeyen bir hata oluştu.";
}

export const questionBankService = {
  /** Soru bankasındaki tüm soruları getirir. */
  async listQuestions(): Promise<QuestionBankItem[]> {
    try {
      const response = await api.get("/api/v1/question-bank/questions");
      return response.data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  /**
   * Yeni bir soru ekler — embedding backend'de otomatik hesaplanır, SQL
   * Editor'e ya da seed script'e gerek yoktur.
   */
  async createQuestion(payload: CreateQuestionPayload): Promise<QuestionBankItem> {
    try {
      const response = await api.post("/api/v1/question-bank/questions", payload);
      return response.data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  /** Bir soruyu günceller (metin değişirse embedding yeniden hesaplanır). */
  async updateQuestion(id: string, payload: UpdateQuestionPayload): Promise<QuestionBankItem> {
    try {
      const response = await api.patch(`/api/v1/question-bank/questions/${id}`, payload);
      return response.data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  /** Bir soruyu kalıcı olarak siler. */
  async deleteQuestion(id: string): Promise<void> {
    try {
      await api.delete(`/api/v1/question-bank/questions/${id}`);
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  /** Bankanın yetersiz kaldığı rol/konu/zorluk kombinasyonlarını getirir. */
  async listGaps(): Promise<QuestionBankGapItem[]> {
    try {
      const response = await api.get("/api/v1/question-bank/gaps");
      return response.data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },
};
