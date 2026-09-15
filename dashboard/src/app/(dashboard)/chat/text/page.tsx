"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Play,
  Award,
  Brain,
  Target,
  MessageSquare,
  ArrowRight,
  KeyRound,
} from "lucide-react";
import { chatService, EvaluationData, ChatStreamDoneData } from "@/services/chatService";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type InterviewState = "SETUP" | "INTERVIEWING" | "RESULTS";

type TranscriptMessage = {
  role: "ai" | "user";
  content: string;
};

export default function TextInterviewPage() {
  const router = useRouter();

  const [currentState, setCurrentState] = useState<InterviewState>("SETUP");

  // Kurulum (Setup) State
  const [role, setRole] = useState("Yazılım Mühendisi");
  const [topic, setTopic] = useState("React ve Modern Web Geliştirme");
  const [difficulty, setDifficulty] = useState("ORTA");

  // Mülakat State
  const [interviewId, setInterviewId] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [userAnswer, setUserAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Yeni mesaj geldikçe transkriptin altına kaydır.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (currentState === "INTERVIEWING" && !isThinking) {
      textareaRef.current?.focus();
    }
  }, [currentState, isThinking]);

  // ----------------------------------------------------------------------
  // MÜLAKAT AKIŞI (kamera/mikrofon/ses YOK — saf metin sohbeti)
  // ----------------------------------------------------------------------
  const handleStartInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsThinking(true);

    try {
      const data = await chatService.startInterview(role, topic, difficulty);
      setInterviewId(data.interview_id);
      setMessages([{ role: "ai", content: data.first_message }]);
      setCurrentState("INTERVIEWING");
    } catch (error) {
      console.error("Mülakat başlatılamadı:", error);
      alert("Mülakat başlatılırken bir hata oluştu.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim() || isThinking) return;

    const currentAnswer = userAnswer.trim();
    setUserAnswer("");
    setIsThinking(true);
    setMessages((prev) => [...prev, { role: "user", content: currentAnswer }, { role: "ai", content: "" }]);

    let streamedText = "";

    try {
      await chatService.sendMessageStream(interviewId, currentAnswer, {
        onChunk: (text) => {
          streamedText += text;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "ai", content: streamedText };
            return next;
          });
        },
        onDone: (data: ChatStreamDoneData) => {
          if (data.interview_complete && data.evaluation) {
            setEvaluation(data.evaluation);
            setCurrentState("RESULTS");
          }
        },
        onError: (detail, partialSaved) => {
          console.error("Stream hatası:", detail, "kısmi metin kaydedildi mi:", partialSaved);
          alert(
            partialSaved
              ? "Yanıt üretimi yarıda kesildi, ama o ana kadarki kısım kaydedildi. Lütfen tekrar deneyin."
              : "Bağlantı hatası oluştu. Lütfen tekrar deneyin."
          );
        },
      });
    } catch (error) {
      console.error("Cevap gönderilemedi:", error);
      alert("Bağlantı hatası oluştu.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleEndInterviewManual = async () => {
    setIsThinking(true);
    try {
      const response = await chatService.finishInterviewEarly(interviewId);
      setEvaluation(response.evaluation ?? null);
      setCurrentState("RESULTS");
    } catch (e) {
      console.error("Mülakatı bitirme hatası:", e);
      alert("Mülakat sonlandırılamadı.");
    } finally {
      setIsThinking(false);
    }
  };

  // ----------------------------------------------------------------------
  // EKRANLAR (RENDER)
  // ----------------------------------------------------------------------

  if (currentState === "SETUP") {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="max-w-md w-full bg-card border border-border rounded-3xl shadow-lg p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-black via-[#00687a] to-[#57dffe]"></div>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-[28px] italic text-foreground tracking-tight">Yazılı mülakata hazır mısınız?</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Rolünüzü ve mülakat konusunu seçin, yapay zeka mülakatçınızla yazışarak ilerleyin.
            </p>
          </div>

          <form onSubmit={handleStartInterview} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Hedef Rol / Pozisyon</label>
              <Input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Örn: Yazılım Mühendisi"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Mülakat Konusu</label>
              <Input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Örn: React ve Modern Web"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Zorluk Seviyesi</label>
              <div className="flex gap-2">
                {["JUNIOR", "ORTA", "UZMAN"].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs tracking-wider transition-all cursor-pointer ${
                      difficulty === level
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-muted border border-border p-4 rounded-xl text-xs text-muted-foreground font-semibold mb-2">
              <KeyRound className="w-5 h-5 text-primary shrink-0" />
              <span>Kamera ve mikrofon gerekmez — mülakat tamamen yazışarak ilerler.</span>
            </div>

            <Button type="submit" size="lg" disabled={isThinking} className="w-full">
              {isThinking ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Hazırlanıyor...</>
              ) : (
                <><Play className="w-5 h-5 fill-current" /> Mülakata Başla</>
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (currentState === "INTERVIEWING") {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] bg-card border border-border rounded-3xl shadow-sm overflow-hidden animate-in fade-in duration-700">

        {/* Üst Kısım */}
        <div className="p-6 flex items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-3 bg-background/80 px-4 py-2.5 rounded-full border border-border shadow-sm">
            <MessageSquare className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">Yazılı Mülakat</span>
            <span className="text-xs text-muted-foreground ml-2 border-l border-border pl-2 font-medium">
              {role}
            </span>
          </div>

          <button
            onClick={handleEndInterviewManual}
            disabled={isThinking}
            className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/15 rounded-xl font-semibold text-xs border border-destructive/20 transition-colors shadow-sm disabled:opacity-50 shrink-0"
          >
            Mülakatı Bitir
          </button>
        </div>

        {/* Orta Kısım: Transkript */}
        <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          <div className="max-w-2xl mx-auto w-full px-6 md:px-8 py-8 space-y-8">
            {messages.map((m, i) =>
              m.role === "ai" ? (
                <div key={i} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 border-l-2 border-primary/20 pl-4 py-0.5">
                    {m.content ? (
                      <p className="font-serif italic text-xl md:text-[1.35rem] text-foreground leading-[1.5] tracking-tight">
                        {m.content}
                      </p>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground font-semibold">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" /> düşünüyor...
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="max-w-[85%] bg-muted border border-border rounded-2xl rounded-tr-sm px-4 py-3">
                    <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              )
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Alt Kısım: Cevap Girişi */}
        <div className="p-6 bg-background/50 border-t border-border">
          <div className="max-w-2xl mx-auto flex items-end gap-3">
            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Cevabınızı buraya yazın..."
                className="min-h-[56px] max-h-40 text-[15px]"
                rows={1}
                disabled={isThinking}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendAnswer();
                  }
                }}
              />
            </div>

            <button
              onClick={handleSendAnswer}
              disabled={!userAnswer.trim() || isThinking}
              className="w-14 h-[56px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-md"
            >
              {isThinking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5 ml-1" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentState === "RESULTS" && evaluation) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="max-w-3xl w-full bg-card border border-border rounded-3xl shadow-2xl p-8 relative overflow-hidden my-auto">

          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-success via-primary to-warning"></div>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-success/10 text-success rounded-full mb-4 ring-8 ring-success/5">
              <Award className="w-8 h-8" />
            </div>
            <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Değerlendirmeniz hazır</h1>
            <p className="text-sm text-muted-foreground font-semibold mt-1">
              Yazılı mülakatınızın AI skorları hesaplandı.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <ScoreCard title="Teknik Bilgi" score={evaluation.technical_score} icon={<Brain className="w-4 h-4 text-primary" />} tone="primary" />
            <ScoreCard title="Özgüven Skoru" score={evaluation.confidence_score} icon={<Target className="w-4 h-4 text-success" />} tone="success" />
            <ScoreCard title="İletişim & Kelime" score={evaluation.vocabulary_score} icon={<MessageSquare className="w-4 h-4 text-warning" />} tone="warning" />
          </div>

          <div className="bg-muted/50 rounded-2xl p-5 border border-border">
            <h3 className="font-bold text-foreground text-sm mb-2 flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> Değerlendirme Özeti
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed font-semibold">
              {evaluation.feedback}
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
            <Button variant="outline" onClick={() => { setCurrentState("SETUP"); setMessages([]); setEvaluation(null); }} className="w-full sm:w-auto">
              Yeni Mülakat Başlat
            </Button>
            <Button onClick={() => router.push(`/interviews/${interviewId}`)} className="w-full sm:w-auto">
              Detaylı Sonuç Raporuna Git <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

        </div>
      </div>
    );
  }

  return null;
}

const scoreToneClasses = {
  primary: { text: "text-primary", bg: "bg-primary/5", border: "border-primary/15" },
  success: { text: "text-success", bg: "bg-success/5", border: "border-success/15" },
  warning: { text: "text-warning", bg: "bg-warning/5", border: "border-warning/15" },
} as const;

function ScoreCard({
  title,
  score,
  icon,
  tone,
}: {
  title: string;
  score: number;
  icon: React.ReactNode;
  tone: keyof typeof scoreToneClasses;
}) {
  const { text, bg, border } = scoreToneClasses[tone];

  return (
    <div className={`border rounded-2xl p-5 text-center shadow-sm hover:shadow transition-all relative overflow-hidden group ${bg} ${border}`}>
      <div className="flex items-center justify-center w-8 h-8 bg-background rounded-full mx-auto mb-3 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xs font-bold text-muted-foreground mb-1">{title}</h3>
      <div className={`font-serif text-3xl ${text}`}>
        {score}<span className="font-sans text-sm text-muted-foreground font-normal">/100</span>
      </div>
    </div>
  );
}
