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

export interface ChatStreamDoneData {
  interview_complete: boolean;
  evaluation: EvaluationData | null;
}

export interface ChatStreamHandlers {
  /** Yeni bir metin parçası üretildiğinde çağrılır (art arda birleştirilmeli). */
  onChunk: (text: string) => void;
  /** Akış başarıyla tamamlandığında bir kez çağrılır. */
  onDone: (data: ChatStreamDoneData) => void;
  /** Akış hiç başlamadan ya da yarıda hata verirse çağrılır. */
  onError: (detail: string, partialSaved: boolean) => void;
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
   * Aday, MAX_INTERVIEW_QUESTIONS'a ulaşılmadan mülakatı erken bitirmek
   * istediğinde çağrılır. Mülakatın bitişi backend'de sunucu taraflı soru
   * sayacına bağlı olduğundan (bkz. /chat), LLM'e "bitir" mesajı göndermek
   * işe yaramaz — bu ayrı uç nokta soru sayısına bakmaksızın o ana kadarki
   * geçmişle nihai değerlendirmeyi zorlar.
   */
  async finishInterviewEarly(interview_id: string): Promise<ChatResponse> {
    try {
      const response = await api.post(`/api/v1/interview/${interview_id}/finish`);
      return response.data;
    } catch (error: unknown) {
      const e = error as { response?: { data?: { detail?: string } }, message?: string };
      throw new Error(
        e.response?.data?.detail ?? `API hatası: ${e.message}`
      );
    }
  },

  /**
   * Kullanıcının cevabını backend'e gönderir ve AI'ın yeni sorusunu (veya
   * mülakat bittiyse nihai değerlendirmeyi) SSE ile token-token akıtır.
   *
   * Not: axios yerine native `fetch` kullanılıyor — tarayıcıda streaming
   * response body'sini okumak için `ReadableStream` gerekiyor, axios bunu
   * (XHR tabanlı olduğu için) native destekliyor gibi görünse de progressive
   * okuma için ek karmaşıklık gerektiriyor; fetch + ReadableStream burada
   * daha basit ve güvenilir.
   */
  async sendMessageStream(
    interview_id: string,
    message: string,
    { onChunk, onDone, onError }: ChatStreamHandlers
  ): Promise<void> {
    const token = Cookies.get("token");
    const baseURL = api.defaults.baseURL ?? "";

    let resp: Response;
    try {
      resp = await fetch(`${baseURL}/api/v1/interview/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ interview_id, message } satisfies ChatRequest),
      });
    } catch (networkError: unknown) {
      const e = networkError as { message?: string };
      onError(`Bağlantı kurulamadı: ${e.message ?? "bilinmeyen hata"}`, false);
      return;
    }

    if (!resp.ok || !resp.body) {
      let detail = `API hatası: HTTP ${resp.status}`;
      try {
        const errJson = await resp.json();
        detail = errJson.detail ?? detail;
      } catch {
        // gövde JSON değilse varsayılan mesajı kullan
      }
      onError(detail, false);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        let eventType = "";
        let dataLine = "";
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
        }
        if (!eventType || !dataLine) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          continue;
        }

        if (eventType === "chunk") {
          onChunk(parsed as string);
        } else if (eventType === "done") {
          onDone(parsed as ChatStreamDoneData);
        } else if (eventType === "error") {
          const err = parsed as { detail?: string; partial_saved?: boolean };
          onError(err.detail ?? "Bilinmeyen bir hata oluştu.", !!err.partial_saved);
        }
      }
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
