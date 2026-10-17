"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
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
  FileText,
  Briefcase,
  ClipboardList,
} from "lucide-react";
import { assignmentService, MyAssignment } from "@/services/assignmentService";
import { pilotService, PilotStatus } from "@/services/pilotService";
import { PostInterviewSurvey } from "@/components/pilot/PostInterviewSurvey";
import { chatService, StarAnalysis, EvaluationData, ChatStreamDoneData } from "@/services/chatService";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cvService, CVDetail, CVItem } from "@/services/cvService";
import { jobService, JobDetail, JobItem } from "@/services/jobService";
import { useAuthStore } from "@/store/useAuthStore";
import { orgService, MyOrganization } from "@/services/orgService";
import { Button } from "@/components/ui/Button";
import { ScoreCard } from "@/components/interview/ScoreCard";
import { LanguageToggle } from "@/components/interview/LanguageToggle";
import type { InterviewLanguage } from "@/services/chatService";
import { BEHAVIORAL_TOPIC, isBehavioralTopic, StarCoachingCard, StarSummary } from "@/components/interview/StarCoaching";
import { useInterviewTurns } from "@/hooks/useInterviewTurns";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type InterviewState = "SETUP" | "INTERVIEWING" | "RESULTS";

type TranscriptMessage = {
  role: "ai" | "user";
  content: string;
  /** Davranışsal mülakatta kullanıcının cevabına verilen STAR koçluğu. */
  star?: StarAnalysis | null;
};

export default function TextInterviewPage() {
  // useSearchParams bir Suspense sınırı gerektirir.
  return (
    <Suspense fallback={null}>
      <TextInterviewContent />
    </Suspense>
  );
}

function TextInterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cvId = searchParams.get("cv");
  const jobId = searchParams.get("job");
  // "Pratik yap" (Gelişimim sayfası) gibi bağlantılardan gelen hazır ayarlar.
  const roleParam = searchParams.get("role");
  const topicParam = searchParams.get("topic");
  const difficultyParam = searchParams.get("difficulty");
  const assignmentParam = searchParams.get("assignment");
  // Yarıda kalmış bir mülakata kaldığı yerden devam (?resume=<id>).
  const resumeParam = searchParams.get("resume");
  const { user } = useAuthStore();

  const [currentState, setCurrentState] = useState<InterviewState>("SETUP");

  // Kurulum (Setup) State
  const [role, setRole] = useState("Yazılım Mühendisi");
  const [topic, setTopic] = useState("React ve Modern Web Geliştirme");
  const [difficulty, setDifficulty] = useState("ORTA");
  const [language, setLanguage] = useState<InterviewLanguage>("tr");

  // CV'ye özel mülakat (opsiyonel, ?cv=<id>)
  const [cv, setCv] = useState<CVDetail | null>(null);
  // İlana göre mülakat (opsiyonel, ?job=<id>)
  const [job, setJob] = useState<JobDetail | null>(null);
  // Kurum bağlamı (opsiyonel): varsayılan bireysel — mülakatın kuruma görünmesi bilinçli bir seçim olmalı.
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [orgId, setOrgId] = useState("");
  // Kurum ödevi (opsiyonel, ?assignment=<id>): rol/konu/zorluk ve kurum ödevden gelir, değiştirilemez.
  const [assignment, setAssignment] = useState<MyAssignment | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // Kurulumdaki CV / ilan seçicileri için listeler (seçim URL parametresine yazılır).
  const [myCvs, setMyCvs] = useState<CVItem[]>([]);
  const [myJobs, setMyJobs] = useState<JobItem[]>([]);
  const [resuming, setResuming] = useState(!!resumeParam);
  // Mülakat State
  const [interviewId, setInterviewId] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [userAnswer, setUserAnswer] = useState("");
  // Gönderim/bitirme ve satır içi hata/onay durumu iki mülakat sayfasında ortak (bkz. useInterviewTurns).
  const { isThinking, setIsThinking, chatError, confirmEnd, setConfirmEnd, sendAnswer, finishEarly, evaluationFailed } =
    useInterviewTurns(interviewId);
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  // Pilot katılımcısıysa sonuç ekranında kısa mülakat anketi gösterilir.
  const [pilot, setPilot] = useState<PilotStatus | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Yeni mesaj geldikçe transkriptin altına kaydır.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    orgService.myOrganizations().then(setOrgs).catch(() => setOrgs([]));
    cvService.listCvs().then(setMyCvs).catch(() => setMyCvs([]));
    jobService.listJobs().then(setMyJobs).catch(() => setMyJobs([]));
  }, []);

  // Profildeki hedef pozisyon, başka bir öneri yoksa rolü önceden doldurur.
  const target = user?.user_metadata?.target as string | undefined;
  useEffect(() => {
    if (target && !roleParam && !cvId && !jobId && !assignmentParam && !resumeParam) setRole(target.slice(0, 80));
  }, [target, roleParam, cvId, jobId, assignmentParam, resumeParam]);

  // Kaldığı yerden devam: geçmişi yükle ve doğrudan sohbet ekranına geç.
  useEffect(() => {
    if (!resumeParam) return;
    let cancelled = false;
    chatService
      .getInterviewDetail(resumeParam)
      .then((detail) => {
        if (cancelled) return;
        if (detail.status === "completed") {
          router.replace(`/interviews/${resumeParam}`);
          return;
        }
        type Msg = { role: string; content: string; coaching?: StarAnalysis | null };
        const history = ((detail.messages ?? []) as Msg[]).filter(
          (m, i) => !(i === 0 && m.role === "user" && m.content === "Mülakatı başlat."),
        );
        setRole(detail.role);
        setTopic(detail.topic);
        if (detail.difficulty) setDifficulty(detail.difficulty);
        setInterviewId(resumeParam);
        setMessages(history.map((m) => ({ role: m.role === "model" ? "ai" : "user", content: m.content, star: m.coaching })));
        setCurrentState("INTERVIEWING");
      })
      .catch((e) => !cancelled && setStartError(e instanceof Error ? e.message : "Mülakat yüklenemedi."))
      .finally(() => !cancelled && setResuming(false));
    return () => {
      cancelled = true;
    };
  }, [resumeParam, router]);

  // CV / ilan seçimi URL'ye yazılır; mevcut yükleme mantığı (öneriler, bağlam bandı) aynen çalışır.
  const setContextParam = (key: "cv" | "job", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/chat/text${params.toString() ? `?${params}` : ""}`);
  };

  useEffect(() => {
    if (roleParam) setRole(roleParam.slice(0, 80));
    if (topicParam) setTopic(topicParam.slice(0, 120));
    if (difficultyParam && ["JUNIOR", "ORTA", "UZMAN"].includes(difficultyParam)) setDifficulty(difficultyParam);
  }, [roleParam, topicParam, difficultyParam]);

  useEffect(() => {
    if (!assignmentParam) {
      setAssignment(null);
      return;
    }
    let cancelled = false;
    assignmentService
      .mine()
      .then((items) => {
        if (cancelled) return;
        const found = items.find((a) => a.id === assignmentParam);
        if (!found) {
          setStartError("Ödev bulunamadı ya da artık bu kurumun öğrencisi değilsiniz.");
          return;
        }
        setAssignment(found);
        setRole(found.role);
        setTopic(found.topic);
        if (found.difficulty) setDifficulty(found.difficulty);
        setOrgId(found.org_id);
      })
      .catch((e) => !cancelled && setStartError(e instanceof Error ? e.message : "Ödev yüklenemedi."));
    return () => {
      cancelled = true;
    };
  }, [assignmentParam]);

  // CV ve/veya ilan seçilmişse yükle; rol/konu/zorluğu öner (kullanıcı değiştirebilir).
  // İlan varsa öneriler ilandan, yoksa CV profilinden gelir.
  useEffect(() => {
    if (!cvId && !jobId) {
      setCv(null);
      setJob(null);
      return;
    }
    let cancelled = false;
    Promise.all([cvId ? cvService.getCv(cvId) : null, jobId ? jobService.getJob(jobId) : null])
      .then(([cvDetail, jobDetail]) => {
        if (cancelled) return;
        setCv(cvDetail);
        setJob(jobDetail);
        const profile = cvDetail?.profile;
        const reqs = jobDetail?.requirements;
        const suggestedRole = jobDetail?.title || profile?.target_roles[0];
        const skills = reqs?.required_skills.length ? reqs.required_skills : profile?.skills ?? [];
        const suggestedLevel = reqs?.seniority || profile?.seniority;
        if (suggestedRole) setRole(suggestedRole);
        if (skills.length > 0) setTopic(skills.slice(0, 2).join(" ve "));
        if (suggestedLevel) setDifficulty(suggestedLevel);
      })
      .catch((e) => !cancelled && setStartError(e instanceof Error ? e.message : "CV veya ilan yüklenemedi."));
    return () => {
      cancelled = true;
    };
  }, [cvId, jobId]);

  useEffect(() => {
    if (currentState !== "RESULTS") return;
    pilotService.status().then(setPilot).catch(() => setPilot(null));
  }, [currentState]);

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
    setStartError(null);

    try {
      const data = await chatService.startInterview(role, topic, difficulty, { cvId: cv?.id, jobId: job?.id, orgId: orgId || undefined, assignmentId: assignment?.id, language });
      setInterviewId(data.interview_id);
      setMessages([{ role: "ai", content: data.first_message }]);
      setCurrentState("INTERVIEWING");
    } catch (error) {
      console.error("Mülakat başlatılamadı:", error);
      setStartError(error instanceof Error ? error.message : "Mülakat başlatılırken bir hata oluştu.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim() || isThinking) return;

    const currentAnswer = userAnswer.trim();
    setUserAnswer("");
    setMessages((prev) => [...prev, { role: "user", content: currentAnswer }, { role: "ai", content: "" }]);

    await sendAnswer(currentAnswer, {
      // Analiz, yeni soru akmadan önce gelir: eklenen kullanıcı baloncuğuna (sondan ikinci) bağlanır.
      onStar: (star) =>
        setMessages((prev) => prev.map((m, i) => (i === prev.length - 2 && m.role === "user" ? { ...m, star } : m))),
      onText: (streamed) =>
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "ai", content: streamed };
          return next;
        }),
      onDone: (data: ChatStreamDoneData) => {
        if (data.interview_complete && data.evaluation) {
          setEvaluation(data.evaluation);
          setCurrentState("RESULTS");
        }
      },
      // Gönderim başarısızsa cevap kaybolmasın: eklenen iki baloncuk geri alınır, metin kutuya döner.
      restore: (streamed) => {
        if (streamed) return;
        setMessages((prev) => prev.slice(0, -2));
        setUserAnswer(currentAnswer);
      },
    });
  };

  const handleEndInterviewManual = () =>
    finishEarly((result) => {
      setEvaluation(result);
      setCurrentState("RESULTS");
    });

  // ----------------------------------------------------------------------
  // EKRANLAR (RENDER)
  // ----------------------------------------------------------------------

  if (currentState === "SETUP" && resuming) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (currentState === "SETUP") {
    return (
      <div className="flex flex-col min-h-[calc(100vh-8rem)] items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
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

          {assignment && (
            <div className="mb-6 flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
              <ClipboardList className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs flex-1 min-w-0">
                <p className="font-bold text-foreground">Ödev: {assignment.title}</p>
                <p className="text-muted-foreground">
                  {assignment.org_name ?? "Kurum"} · rol, konu ve zorluk eğitmen tarafından belirlendi
                </p>
                {assignment.instructions && <p className="text-foreground mt-1.5 whitespace-pre-wrap">{assignment.instructions}</p>}
              </div>
            </div>
          )}

          {job && (
            <div className="mb-3 flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
              <Briefcase className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs flex-1 min-w-0">
                <p className="font-bold text-foreground">Bu ilana göre mülakat</p>
                <p className="text-muted-foreground truncate">{[job.title, job.company].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          )}

          {cv && (
            <div className="mb-6 flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
              <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs flex-1 min-w-0">
                <p className="font-bold text-foreground">CV&apos;nize göre kişiselleştirilecek</p>
                <p className="text-muted-foreground truncate">{cv.original_filename}</p>
                {!cv.profile && (
                  <p className="text-warning mt-1">
                    Bu CV henüz analiz edilmemiş. <Link href="/cv" className="underline font-semibold">CV sayfasında analiz edin.</Link>
                  </p>
                )}
              </div>
              <Link href="/chat/text" className="text-[11px] text-muted-foreground underline shrink-0">CV&apos;siz devam et</Link>
            </div>
          )}

          <form onSubmit={handleStartInterview} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Hedef Rol / Pozisyon</label>
              <Input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Örn: Yazılım Mühendisi"
                readOnly={!!assignment}
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
                readOnly={!!assignment}
                required
              />
              {!assignment && (
                <button
                  type="button"
                  onClick={() => setTopic(BEHAVIORAL_TOPIC)}
                  aria-pressed={isBehavioralTopic(topic)}
                  className={`ml-1 text-xs font-semibold rounded-full px-3 py-1 border transition-colors ${
                    isBehavioralTopic(topic) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Davranışsal (STAR) mülakat
                </button>
              )}
              {isBehavioralTopic(topic) && (
                <p className="text-xs text-muted-foreground ml-1 leading-relaxed">
                  &quot;Bana ... bir zamanı anlat&quot; türü sorular. Her cevabınızdan sonra Durum, Görev, Eylem ve Sonuç öğelerine göre koçluk notu alırsınız.
                </p>
              )}
            </div>

            <LanguageToggle value={language} onChange={setLanguage} />

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Zorluk Seviyesi</label>
              <div className="flex gap-2">
                {["JUNIOR", "ORTA", "UZMAN"].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    disabled={!!assignment && difficulty !== level}
                    className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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

            {!assignment && (myCvs.length > 0 || myJobs.length > 0) && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Kişiselleştir (opsiyonel)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {myCvs.length > 0 && (
                    <select
                      aria-label="CV'ye göre kişiselleştir"
                      value={cvId ?? ""}
                      onChange={(e) => setContextParam("cv", e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                    >
                      <option value="">CV kullanma</option>
                      {myCvs.map((c) => (
                        <option key={c.id} value={c.id}>CV: {c.original_filename}</option>
                      ))}
                    </select>
                  )}
                  {myJobs.length > 0 && (
                    <select
                      aria-label="İlana göre mülakat"
                      value={jobId ?? ""}
                      onChange={(e) => setContextParam("job", e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                    >
                      <option value="">İlan seçme</option>
                      {myJobs.map((j) => (
                        <option key={j.id} value={j.id}>İlan: {[j.title, j.company].filter(Boolean).join(" · ") || "Başlıksız"}</option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground ml-1">Seçerseniz sorular CV&apos;nize ve/veya ilanın gereksinimlerine göre uyarlanır.</p>
              </div>
            )}

            {orgs.length > 0 && !assignment && (
              <div className="space-y-2">
                <label htmlFor="org-select" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Mülakat bağlamı</label>
                <select
                  id="org-select"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                >
                  <option value="">Bireysel (kuruma görünmez)</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                {orgId && (
                  <p className="text-[11px] text-muted-foreground ml-1">
                    Bu mülakat kurumun kotasından düşer ve kurumun soru bankası kullanılır. Eğitmenler katılımınızı görür;
                    skorlarınızı yalnızca &quot;Kurumlarım&quot; sayfasından paylaşım izni verdiyseniz görür.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 bg-muted border border-border p-4 rounded-xl text-xs text-muted-foreground font-semibold mb-2">
              <KeyRound className="w-5 h-5 text-primary shrink-0" />
              <span>Kamera ve mikrofon gerekmez — mülakat tamamen yazışarak ilerler.</span>
            </div>

            {startError && (
              <p role="alert" className="text-xs font-semibold text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                {startError}
              </p>
            )}

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

          {confirmEnd ? (
            <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Mülakatı bitirme onayı">
              <span className="hidden sm:inline text-xs text-muted-foreground">Şimdiye kadarki cevaplarla değerlendirilsin mi?</span>
              <button
                onClick={handleEndInterviewManual}
                disabled={isThinking}
                className="px-3 py-2 bg-destructive text-white rounded-xl font-semibold text-xs disabled:opacity-50"
              >
                Bitir
              </button>
              <button onClick={() => setConfirmEnd(false)} className="px-3 py-2 bg-background border border-border rounded-xl font-semibold text-xs">
                Vazgeç
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmEnd(true)}
              disabled={isThinking}
              className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/15 rounded-xl font-semibold text-xs border border-destructive/20 transition-colors shadow-sm disabled:opacity-50 shrink-0"
            >
              Mülakatı Bitir
            </button>
          )}
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
                  <div className="max-w-[85%]">
                    <div className="bg-muted border border-border rounded-2xl rounded-tr-sm px-4 py-3">
                      <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>
                    {m.star && <StarCoachingCard star={m.star} />}
                  </div>
                </div>
              )
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Alt Kısım: Cevap Girişi */}
        <div className="p-6 bg-background/50 border-t border-border">
          {chatError && (
            <div role="alert" className="max-w-2xl mx-auto mb-3 text-xs font-semibold text-destructive bg-destructive/10 rounded-xl px-4 py-2.5">
              {chatError}
              {evaluationFailed && (
                <button
                  type="button"
                  onClick={handleEndInterviewManual}
                  disabled={isThinking}
                  className="block mt-2 font-bold underline disabled:opacity-60"
                >
                  {isThinking ? "Değerlendiriliyor..." : "Değerlendirmeyi tekrar dene"}
                </button>
              )}
            </div>
          )}
          <div className="max-w-2xl mx-auto flex items-end gap-3">
            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={language === "en" ? "Cevabınızı buraya İngilizce yazın..." : "Cevabınızı buraya yazın..."}
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
              aria-label="Cevabı gönder"
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
            <ScoreCard title={isBehavioralTopic(topic) ? "STAR Yapısı" : "Teknik Bilgi"} score={evaluation.technical_score} icon={<Brain className="w-4 h-4 text-primary" />} tone="primary" />
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

          {messages.some((m) => m.star) && (
            <div className="mt-6">
              <StarSummary analyses={messages.flatMap((m) => (m.star ? [m.star] : []))} />
            </div>
          )}

          {pilot?.consent && (
            <div className="mt-6">
              <PostInterviewSurvey interviewId={interviewId} items={pilot.post_items} />
            </div>
          )}

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

