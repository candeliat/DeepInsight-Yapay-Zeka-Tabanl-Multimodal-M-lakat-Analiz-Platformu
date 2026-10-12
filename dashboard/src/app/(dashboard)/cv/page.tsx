"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Sparkles,
  Play,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { cvService, ConsentStatus, CVItem, CVAnalysis, ATSCheck } from "@/services/cvService";
import { Button } from "@/components/ui/Button";
import { ScoreRing } from "@/components/ui/ScoreRing";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".png", ".jpg", ".jpeg"];

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function CheckRow({ check }: { check: ATSCheck }) {
  const Icon = check.status === "pass" ? CheckCircle2 : check.status === "partial" ? AlertTriangle : XCircle;
  const color = check.status === "pass" ? "text-success" : check.status === "partial" ? "text-warning" : "text-destructive";
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground">{check.label}</span>
          <span className="text-xs font-bold text-muted-foreground shrink-0">
            {check.earned}/{check.weight}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
        {check.tip && <p className="text-xs text-foreground/80 mt-1.5 bg-muted/60 rounded-lg px-3 py-2">{check.tip}</p>}
      </div>
    </li>
  );
}

export default function CVPage() {
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"consent" | "upload" | "analyze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectCv = useCallback(async (id: string | null) => {
    setSelectedId(id);
    setAnalysis(null);
    setConfirmDeleteId(null);
    if (!id) return;
    try {
      setAnalysis(await cvService.getLatestAnalysis(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz yüklenemedi.");
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await cvService.getConsent();
      setConsent(status);
      if (status.granted) {
        const list = await cvService.listCvs();
        setCvs(list);
        await selectCv(list[0]?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [selectCv]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runAnalysis = async (id: string) => {
    setBusy("analyze");
    setError(null);
    try {
      setAnalysis(await cvService.analyzeCv(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz yapılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handleGrantConsent = async () => {
    setBusy("consent");
    setError(null);
    try {
      setConsent(await cvService.grantConsent());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rıza kaydedilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    setBusy("consent");
    try {
      await cvService.revokeConsent();
      setConfirmRevoke(false);
      setCvs([]);
      await selectCv(null);
      setConsent(await cvService.getConsent());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rıza geri çekilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setError("Desteklenmeyen dosya türü. PDF, DOCX, PNG veya JPEG yükleyin.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Dosya çok büyük (en fazla 10 MB).");
      return;
    }

    setBusy("upload");
    try {
      const created = await cvService.uploadCv(file);
      setCvs((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setAnalysis(null);
      await runAnalysis(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await cvService.deleteCv(id);
      const next = cvs.filter((c) => c.id !== id);
      setCvs(next);
      setConfirmDeleteId(null);
      if (selectedId === id) await selectCv(next[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi.");
    }
  };

  const selected = cvs.find((c) => c.id === selectedId) ?? null;
  const profile = analysis?.profile ?? null;

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <FileText className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">CV Analizi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          CV&apos;nizi yükleyin; ATS uyumluluğunu kontrol edelim ve mülakat sorularını size göre kişiselleştirelim.
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
      ) : consent && !consent.granted ? (
        <div className="bg-card border border-border rounded-3xl shadow-sm p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h2 className="font-bold text-foreground">Kişisel verilerin işlenmesi için açık rıza</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{consent.text}</p>
          <Button className="mt-6" onClick={handleGrantConsent} disabled={busy === "consent"}>
            {busy === "consent" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Okudum, kabul ediyorum
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* Sol: yükleme + CV listesi */}
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => busy === null && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS.join(",")}
                className="hidden"
                data-testid="cv-file-input"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {busy === "upload" || busy === "analyze" ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  <span className="text-sm font-semibold">{busy === "upload" ? "Yükleniyor..." : "Analiz ediliyor..."}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="w-8 h-8 text-primary" />
                  <span className="text-sm font-semibold text-foreground">CV yükle</span>
                  <span className="text-xs text-muted-foreground">PDF, DOCX, PNG veya JPEG · en fazla 10 MB</span>
                </div>
              )}
            </div>

            <ul className="space-y-2">
              {cvs.map((cv) => (
                <li
                  key={cv.id}
                  className={`border rounded-2xl px-4 py-3 transition-colors ${
                    cv.id === selectedId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <button className="w-full text-left" onClick={() => selectCv(cv.id)}>
                    <p className="text-sm font-semibold text-foreground truncate">{cv.original_filename}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatSize(cv.size_bytes)}
                      {cv.extraction_method === "ocr" && " · OCR ile okundu"}
                    </p>
                  </button>
                  <div className="mt-2 flex justify-end">
                    {confirmDeleteId === cv.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Kalıcı olarak silinsin mi?</span>
                        <button onClick={() => handleDelete(cv.id)} className="font-bold text-destructive hover:underline">
                          Evet, sil
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground hover:underline">
                          Vazgeç
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(cv.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                        title="Sil"
                        aria-label={`${cv.original_filename} dosyasını sil`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {cvs.length === 0 && <li className="text-xs text-muted-foreground text-center py-4">Henüz CV yüklemediniz.</li>}
            </ul>

            <div className="pt-2 border-t border-border">
              {confirmRevoke ? (
                <div className="text-xs space-y-2">
                  <p className="text-muted-foreground">Rızanız geri çekilir ve yüklediğiniz tüm CV&apos;ler kalıcı olarak silinir.</p>
                  <div className="flex gap-3">
                    <button onClick={handleRevoke} disabled={busy === "consent"} className="font-bold text-destructive hover:underline">
                      Evet, hepsini sil
                    </button>
                    <button onClick={() => setConfirmRevoke(false)} className="text-muted-foreground hover:underline">
                      Vazgeç
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmRevoke(true)} className="text-xs text-muted-foreground hover:text-destructive hover:underline">
                  Rızamı geri çek ve tüm CV&apos;lerimi sil
                </button>
              )}
            </div>
          </div>

          {/* Sağ: analiz */}
          <div>
            {!selected ? (
              <div className="bg-card border border-border rounded-3xl p-12 text-center text-sm text-muted-foreground">
                Analiz için soldan bir CV yükleyin veya seçin.
              </div>
            ) : !analysis && (busy === "upload" || busy === "analyze") ? (
              <div className="bg-card border border-border rounded-3xl p-10 text-center space-y-3" aria-live="polite">
                <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
                <p className="text-sm font-semibold text-foreground">CV&apos;niz analiz ediliyor...</p>
                <p className="text-xs text-muted-foreground">ATS kontrolleri ve profil çıkarma birkaç saniye ile bir dakika arası sürebilir.</p>
              </div>
            ) : !analysis ? (
              <div className="bg-card border border-border rounded-3xl p-10 text-center space-y-4">
                <p className="text-sm text-muted-foreground">Bu CV için henüz analiz yapılmadı.</p>
                <Button onClick={() => runAnalysis(selected.id)} disabled={busy !== null}>
                  {busy === "analyze" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analiz Et
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
                  <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                    <ScoreRing score={analysis.ats_score} ariaLabel={`ATS uyumluluk skoru ${analysis.ats_score} / 100`} />
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <h2 className="font-serif italic text-2xl text-foreground">ATS Uyumluluk Skoru</h2>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Bu skor, başvuru takip sistemlerinin (ATS) yaygın zayıflıklarına göre hesaplanan bir <strong>tahmindir</strong>.
                        Belirli bir şirketin sisteminden geçeceğinin garantisi değildir.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
                        <Button size="sm" variant="outline" onClick={() => runAnalysis(selected.id)} disabled={busy !== null}>
                          {busy === "analyze" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Yeniden analiz et
                        </Button>
                        {profile ? (
                          <Button size="sm" asChild>
                            <Link href={`/chat/text?cv=${selected.id}`}>
                              <Play className="w-3.5 h-3.5 fill-current" /> Bu CV ile mülakat yap
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground self-center">
                            Mülakat için profil çıkarılmalı — yeniden analiz edin.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {analysis.profile_error && (
                    <p className="mt-4 text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">{analysis.profile_error}</p>
                  )}
                </div>

                <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
                  <h3 className="font-bold text-foreground text-sm mb-1">Kontroller</h3>
                  <ul className="divide-y divide-border/60">
                    {analysis.breakdown.map((check) => (
                      <CheckRow key={check.id} check={check} />
                    ))}
                  </ul>
                </div>

                {analysis.suggestions.length > 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-3xl p-6">
                    <h3 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" /> Öneriler
                    </h3>
                    <ul className="space-y-2 list-disc pl-5 text-sm text-foreground/90">
                      {analysis.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {profile && (
                  <div className="bg-card border border-border rounded-3xl shadow-sm p-6 space-y-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="font-bold text-foreground text-sm">Çıkarılan Profil</h3>
                      {profile.seniority && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                          {profile.seniority}
                          {profile.experience_years != null && ` · ~${profile.experience_years} yıl deneyim`}
                        </span>
                      )}
                    </div>
                    {profile.target_roles.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Uygun roller: <span className="text-foreground font-semibold">{profile.target_roles.join(" · ")}</span>
                      </p>
                    )}
                    {profile.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.skills.map((skill) => (
                          <span key={skill} className="text-xs px-2.5 py-1 rounded-full bg-muted text-foreground">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    {profile.experience.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Deneyim</p>
                        {profile.experience.map((exp, i) => (
                          <div key={i} className="text-sm">
                            <span className="font-semibold text-foreground">{exp.title ?? "—"}</span>
                            <span className="text-muted-foreground"> · {exp.company ?? "—"}</span>
                            {(exp.start || exp.end) && (
                              <span className="text-muted-foreground text-xs">
                                {" "}
                                ({[exp.start, exp.end].filter(Boolean).join(" – ")})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
