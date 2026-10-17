"use client";

import { useState } from "react";
import { chatService, ChatStreamDoneData, EvaluationData, StarAnalysis } from "@/services/chatService";

const PARTIAL_SAVED = "Yanıt üretimi yarıda kesildi, ama o ana kadarki kısım kaydedildi. Lütfen tekrar deneyin.";
const CONNECTION_LOST = "Bağlantı hatası oluştu; cevabınız kutuda duruyor, tekrar gönderebilirsiniz.";
const FINISH_FAILED = "Mülakat sonlandırılamadı. Bağlantınızı kontrol edip tekrar deneyin.";

export interface AnswerHandlers {
  /** Davranışsal mülakatta gönderilen cevabın STAR analizi. */
  onStar?: (star: StarAnalysis) => void;
  /** Akış boyunca o ana kadar gelen metnin tamamı. */
  onText: (streamed: string) => void;
  onDone: (data: ChatStreamDoneData, streamed: string) => void;
  /** Gönderim kaydedilmeden başarısız oldu: cevap kutuya geri konmalı (streamed: gelen kısım). */
  restore: (streamed: string) => void;
}

/**
 * Görüntülü ve yazılı mülakatın ortak tur mantığı: cevabı akışla gönderme, hata
 * kurtarma (cevap kaybolmaz), "Mülakatı Bitir" onayı ve erken bitirme. Ekrana özgü
 * kısımlar (baloncuklar, soru metni, kamera/ses) geri çağrılarla sayfalarda kalır.
 */
export function useInterviewTurns(interviewId: string) {
  const [isThinking, setIsThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Son cevaptan sonra değerlendirme yapılamadı: cevaplar kayıtlı, mülakat açık; "tekrar dene" gösterilir.
  const [evaluationFailed, setEvaluationFailed] = useState(false);

  const sendAnswer = async (answer: string, handlers: AnswerHandlers) => {
    setChatError(null);
    setEvaluationFailed(false);
    setIsThinking(true);
    let streamed = "";
    try {
      await chatService.sendMessageStream(interviewId, answer, {
        onStar: handlers.onStar,
        onChunk: (text) => {
          streamed += text;
          handlers.onText(streamed);
        },
        onDone: (data) => handlers.onDone(data, streamed),
        onError: (detail, partialSaved, failedEvaluation) => {
          console.error("Stream hatası:", detail, "kısmi metin kaydedildi mi:", partialSaved);
          if (failedEvaluation) {
            // Cevap kaydedildi; kutuya geri konmaz, değerlendirme tekrar denenir.
            setEvaluationFailed(true);
            setChatError(detail);
            return;
          }
          if (!partialSaved) handlers.restore(streamed);
          setChatError(partialSaved ? PARTIAL_SAVED : CONNECTION_LOST);
        },
      });
    } catch (error) {
      console.error("Cevap gönderilemedi:", error);
      handlers.restore(streamed);
      setChatError(CONNECTION_LOST);
    } finally {
      setIsThinking(false);
    }
  };

  /** Soru sayısına bakmaksızın o ana kadarki cevaplarla değerlendirmeyi alır. */
  const finishEarly = async (onFinished: (evaluation: EvaluationData | null) => void) => {
    setConfirmEnd(false);
    setChatError(null);
    setIsThinking(true);
    try {
      const response = await chatService.finishInterviewEarly(interviewId);
      setEvaluationFailed(false);
      onFinished(response.evaluation ?? null);
    } catch (e) {
      console.error("Mülakatı bitirme hatası:", e);
      const failed = (e as { status?: number }).status === 503;
      setEvaluationFailed(failed);
      setChatError(failed && e instanceof Error ? e.message : FINISH_FAILED);
    } finally {
      setIsThinking(false);
    }
  };

  return {
    isThinking, setIsThinking, chatError, setChatError, confirmEnd, setConfirmEnd, sendAnswer, finishEarly, evaluationFailed,
  };
}
