"use client";

import { formatScore } from "@/lib/scoreBand";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Loader2,
  Sparkles,
  Trash2,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Play,
  Target,
  Clock,
} from "lucide-react";
import { jobService, JobItem, JobMatch, SkillMatch } from "@/services/jobService";
import { cvService, CVItem } from "@/services/cvService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { CoverLetterPanel } from "@/components/jobs/CoverLetterPanel";

const MIN_TEXT = 80;

const EXPERIENCE_TEXT: Record<string, string> = {
  meets: "Deneyim yılınız ilanın beklentisini karşılıyor.",
  close: "Deneyim yılınız beklentiye çok yakın.",
  below: "Deneyim yılınız ilanın beklentisinin altında.",
  unknown: "CV'nizden deneyim yılı hesaplanamadı.",
};

function SkillRow({ item }: { item: SkillMatch }) {
  if (item.status === "matched") {
    return (
      <li className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span className="text-foreground">{item.skill}</span>
      </li>
    );
  }
  if (item.status === "in_text") {
    return (
      <li className="flex items-start gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <span className="text-foreground">
          {item.skill}
          <span className="block text-[11px] text-muted-foreground">CV metninde geçiyor ama beceriler listenizde yok — ekleyin.</span>
        </span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-sm">
      <XCircle className="w-4 h-4 text-destructive shrink-0" />
      <span className="text-muted-foreground">{item.skill}</span>
    </li>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedCvId, setSelectedCvId] = useState<string>("");
  const [match, setMatch] = useState<JobMatch | null>(null);

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"create" | "match" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobList, consent] = await Promise.all([jobService.listJobs(), cvService.getConsent()]);
      setJobs(jobList);
      setSelectedJobId(jobList[0]?.id ?? null);
      if (consent.granted) {
        const cvList = await cvService.listCvs();
        setCvs(cvList);
        setSelectedCvId(cvList[0]?.id ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Seçili ilan + CV için daha önce yapılmış eşleştirme varsa göster.
  useEffect(() => {
    setMatch(null);
    if (!selectedJobId || !selectedCvId) return;
    let cancelled = false;
    jobService
      .getLatestMatch(selectedJobId, selectedCvId)
      .then((m) => !cancelled && setMatch(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, selectedCvId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < MIN_TEXT) {
      setError(`İlan metni en az ${MIN_TEXT} karakter olmalı.`);
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const job = await jobService.createJob({
        text: text.trim(),
        title: title.trim() || undefined,
        company: company.trim() || undefined,
      });
      setJobs((prev) => [job, ...prev]);
      setSelectedJobId(job.id);
      setText("");
      setTitle("");
      setCompany("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "İlan analiz edilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const handleMatch = async () => {
    if (!selectedJobId || !selectedCvId) return;
    setBusy("match");
    setError(null);
    try {
      setMatch(await jobService.matchJob(selectedJobId, selectedCvId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eşleştirme yapılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await jobService.deleteJob(id);
      const next = jobs.filter((j) => j.id !== id);
      setJobs(next);
      setConfirmDeleteId(null);
      if (selectedJobId === id) setSelectedJobId(next[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi.");
    }
  };

  const job = jobs.find((j) => j.id === selectedJobId) ?? null;
  const reqs = job?.requirements;

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Briefcase className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">İlan Eşleştirme</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Başvurmak istediğiniz ilanı yapıştırın; CV&apos;nizle ne kadar örtüştüğünü, eksiklerinizi ve nasıl kapatacağınızı görün.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline shrink-0">
            Kapat
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          {/* Sol: yeni ilan + ilan listesi */}
          <div className="space-y-4">
            <form onSubmit={handleCreate} className="bg-card border border-border rounded-3xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-foreground text-sm">Yeni ilan</h2>
              <Input aria-label="Pozisyon (opsiyonel)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pozisyon (opsiyonel)" maxLength={150} />
              <Input aria-label="Şirket (opsiyonel)" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Şirket (opsiyonel)" maxLength={150} />
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="İlan metnini buraya yapıştırın..."
                className="min-h-[160px] text-sm"
                maxLength={15000}
                aria-label="İlan metni"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">{text.trim().length} karakter</span>
                <Button type="submit" size="sm" disabled={busy !== null}>
                  {busy === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {busy === "create" ? "Analiz ediliyor..." : "İlanı analiz et"}
                </Button>
              </div>
            </form>

            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className={`border rounded-2xl px-4 py-3 transition-colors ${
                    j.id === selectedJobId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <button className="w-full text-left" onClick={() => setSelectedJobId(j.id)}>
                    <p className="text-sm font-semibold text-foreground truncate">{j.title || "Başlıksız ilan"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[j.company, `${j.requirements.required_skills.length} zorunlu beceri`].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                  <div className="mt-2 flex justify-end">
                    {confirmDeleteId === j.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Silinsin mi?</span>
                        <button onClick={() => handleDelete(j.id)} className="font-bold text-destructive hover:underline">
                          Evet, sil
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground hover:underline">
                          Vazgeç
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(j.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                        aria-label={`${j.title || "ilanı"} sil`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {jobs.length === 0 && <li className="text-xs text-muted-foreground text-center py-4">Henüz ilan eklemediniz.</li>}
            </ul>
          </div>

          {/* Sağ: ilan detayı + eşleştirme */}
          <div className="space-y-6">
            {!job || !reqs ? (
              <div className="bg-card border border-border rounded-3xl p-12 text-center text-sm text-muted-foreground">
                Başlamak için soldan bir ilan ekleyin veya seçin.
              </div>
            ) : (
              <>
                <div className="bg-card border border-border rounded-3xl shadow-sm p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-serif italic text-2xl text-foreground">{job.title || "Başlıksız ilan"}</h2>
                      {job.company && <p className="text-sm text-muted-foreground">{job.company}</p>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {reqs.seniority && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{reqs.seniority}</span>
                      )}
                      {reqs.min_years_experience != null && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-muted text-foreground">
                          En az {reqs.min_years_experience} yıl
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Zorunlu beceriler</p>
                    <div className="flex flex-wrap gap-1.5">
                      {reqs.required_skills.map((s) => (
                        <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-muted text-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  {reqs.nice_to_have_skills.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Tercih edilenler</p>
                      <div className="flex flex-wrap gap-1.5">
                        {reqs.nice_to_have_skills.map((s) => (
                          <span key={s} className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3 sm:items-center">
                    {cvs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Eşleştirme için önce <Link href="/cv" className="underline font-semibold">bir CV yükleyip analiz edin</Link>.
                      </p>
                    ) : (
                      <>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider" htmlFor="cv-select">
                          CV
                        </label>
                        <select
                          id="cv-select"
                          value={selectedCvId}
                          onChange={(e) => setSelectedCvId(e.target.value)}
                          className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground"
                        >
                          {cvs.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.original_filename}
                            </option>
                          ))}
                        </select>
                        <Button onClick={handleMatch} disabled={busy !== null || !selectedCvId}>
                          {busy === "match" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                          {match ? "Yeniden eşleştir" : "Eşleştir"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {busy === "match" && !match && (
                  <div className="bg-card border border-border rounded-3xl p-10 text-center space-y-3" aria-live="polite">
                    <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
                    <p className="text-sm font-semibold text-foreground">Eşleştiriliyor ve yol haritası hazırlanıyor...</p>
                  </div>
                )}

                {match && (
                  <>
                    <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
                      <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                        <ScoreRing
                          score={match.match_score}
                          labels={["Yüksek uyum", "Orta uyum", "Düşük uyum"]}
                          ariaLabel={`İlan uyum skoru ${match.match_score} / 100`}
                        />
                        <div className="flex-1 min-w-0 space-y-3">
                          <h3 className="font-serif italic text-2xl text-foreground">İlan uyumu</h3>
                          {match.summary && <p className="text-sm text-foreground/90 leading-relaxed">{match.summary}</p>}
                          <div className="space-y-2">
                            {match.breakdown.components.map((c) => (
                              <div key={c.id}>
                                <div className="flex justify-between text-xs">
                                  <span className="font-semibold text-foreground">{c.label}</span>
                                  <span className="text-muted-foreground">
                                    {formatScore(c.earned, 1)}/{c.weight}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${(c.earned / c.weight) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                          {EXPERIENCE_TEXT[match.breakdown.experience.status] && (
                            <p className="text-xs text-muted-foreground">{EXPERIENCE_TEXT[match.breakdown.experience.status]}</p>
                          )}
                          <Button size="sm" asChild>
                            <Link href={`/chat/text?cv=${match.cv_id}&job=${match.job_id}`}>
                              <Play className="w-3.5 h-3.5 fill-current" /> Bu ilana göre mülakat yap
                            </Link>
                          </Button>
                        </div>
                      </div>
                      {match.llm_error && <p className="mt-4 text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">{match.llm_error}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
                        <h3 className="font-bold text-foreground text-sm mb-3">Zorunlu beceriler</h3>
                        <ul className="space-y-2">
                          {match.breakdown.required.map((i) => (
                            <SkillRow key={i.skill} item={i} />
                          ))}
                        </ul>
                      </div>
                      {match.breakdown.nice_to_have.length > 0 && (
                        <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
                          <h3 className="font-bold text-foreground text-sm mb-3">Tercih edilenler</h3>
                          <ul className="space-y-2">
                            {match.breakdown.nice_to_have.map((i) => (
                              <SkillRow key={i.skill} item={i} />
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {match.roadmap.length > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-3xl p-6">
                        <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" /> Öğrenme yol haritası
                        </h3>
                        <ol className="space-y-4">
                          {match.roadmap.map((r, idx) => (
                            <li key={r.skill} className="bg-card border border-border rounded-2xl p-4">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <span className="font-semibold text-foreground text-sm">
                                  {idx + 1}. {r.skill}
                                </span>
                                <span className="flex items-center gap-2 text-[11px]">
                                  <span
                                    className={`font-bold px-2 py-0.5 rounded-full ${
                                      r.priority === "yüksek" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                                    }`}
                                  >
                                    {r.priority} öncelik
                                  </span>
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Clock className="w-3 h-3" /> ~{r.est_weeks} hafta
                                  </span>
                                </span>
                              </div>
                              {r.why && <p className="text-xs text-muted-foreground mt-1">{r.why}</p>}
                              <ul className="mt-2 space-y-1 list-disc pl-5 text-sm text-foreground/90">
                                {r.steps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {match.breakdown.interview_focus.length > 0 && (
                      <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
                        <h3 className="font-bold text-foreground text-sm mb-3">Mülakatta muhtemel konular</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {match.breakdown.interview_focus.map((t) => (
                            <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-muted text-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {selectedCvId && busy !== "match" && (
                  // İlan ya da CV değişince taslak sıfırlanır.
                  <CoverLetterPanel key={`${job.id}:${selectedCvId}`} jobId={job.id} cvId={selectedCvId} jobTitle={job.title} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
