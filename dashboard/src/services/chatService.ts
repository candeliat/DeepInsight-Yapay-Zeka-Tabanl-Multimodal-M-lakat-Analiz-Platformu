export interface StartInterviewRequest {
  role: string;
  topic: string;
  user_id?: string;
}

export interface StartInterviewResponse {
  interview_id: string;
  first_message: string;
}

export interface ChatRequest {
  interview_id: string;
  message: string;
}

export interface EvaluationData {
  technical_score: number;
  confidence_score: number;
  vocabulary_score: number;
  feedback: string;
}

export interface ChatResponse {
  response: string;
  interview_complete: boolean;
  evaluation?: EvaluationData;
}

import { api } from "../lib/api";
import Cookies from "js-cookie";

export const chatService = {
  /**
   * Yeni bir mülakat oturumu başlatır.
   */
  async startInterview(role: string, topic: string, userId?: string): Promise<StartInterviewResponse> {
    try {
      const response = await api.post("/api/v1/interview/start", { role, topic, user_id: userId } satisfies StartInterviewRequest);
      return response.data;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { detail?: string } }, message?: string };
      throw new Error(
        e.response?.data?.detail ?? `API hatası: ${e.message}`
      );
    }
  },

  /**
   * Kullanıcının cevabını backend'e gönderir ve AI'ın yeni sorusunu alır.
   */
  async sendMessage(interview_id: string, message: string): Promise<ChatResponse> {
    try {
      const response = await api.post("/api/v1/interview/chat", { interview_id, message } satisfies ChatRequest);
      return response.data;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { detail?: string } }, message?: string };
      throw new Error(
        e.response?.data?.detail ?? `API hatası: ${e.message}`
      );
    }
  },

  /**
   * Kullanıcının geçmiş mülakatlarını getirir (auth token üzerinden me endpointi).
   */
  async getMyInterviews(): Promise<any[]> {
    try {
      const response = await api.get(`/api/v1/interview/me`);
      return response.data;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { detail?: string } }, message?: string };
      throw new Error(
        e.response?.data?.detail ?? `API hatası: ${e.message}`
      );
    }
  },

  /**
   * Belirli bir mülakatın detaylarını getirir (skorlar, mesajlar, feedback).
   */
  async getInterviewDetail(id: string): Promise<any> {
    try {
      const response = await api.get(`/api/v1/interview/${id}`);
      return response.data;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { detail?: string } }, message?: string };
      throw new Error(
        e.response?.data?.detail ?? `API hatası: ${e.message}`
      );
    }
  },

  /**
   * Kaydedilen mülakat videosunu backend'e yükler.
   */
  async uploadRecording(interviewId: string, file: Blob, filename: string): Promise<any> {
    try {
      const formData = new FormData();
      formData.append("file", file, filename);

      const token = Cookies.get("token");
      const headers: Record<string, string> = {
        "Content-Type": "multipart/form-data",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await api.post(`/api/v1/analytics/analyze/${interviewId}`, formData, {
        headers,
      });
      return response.data;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { detail?: string } }, message?: string };
      throw new Error(
        e.response?.data?.detail ?? `API hatası: ${e.message}`
      );
    }
  },

  /**
   * Mülakata ait yapay zeka analiz sonuçlarını getirir.
   */
  async getInterviewAnalytics(interviewId: string): Promise<any> {
    try {
      const token = Cookies.get("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await api.get(`/api/v1/analytics/results/${interviewId}`, {
        headers,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.detail ?? `API hatası: ${error.message}`
      );
    }
  },
};
