"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, Loader2, XCircle, CheckCircle2, ShieldCheck, ArrowRight, BarChart3 } from "lucide-react";
import { pilotService, PilotStatus } from "@/services/pilotService";
import { useAuthStore } from "@/store/useAuthStore";
import { PostInterviewSurvey } from "@/components/pilot/PostInterviewSurvey";
import { LikertItem } from "@/components/pilot/Likert";
import { StatTile } from "@/components/progress/ProgressView";
import { Button } from "@/components/ui/Button";

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : "";
}

export default function PilotPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.app_metadata?.role === "admin";

  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const [sus, setSus] = useState<(number | undefined)[]>(Array(10).fill(undefined));
  const [editSus, setEditSus] = useState(false);
  const [susResult, setSusResult] = useState<{ score: number; grade: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await pilotService.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleConsent = async (granted: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await pilotService.setConsent(granted);
      setConfirmLeave(false);
      setSusResult(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const handleSus = async () => {
    if (sus.some((v) => v === undefined)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await pilotService.submitSus(sus as number[]);
      setSusResult(res);
      setEditSus(false);
      setStatus((s) => (s ? { ...s, sus_score: res.score } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anket gönderilemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const showSusForm = status?.consent && (status.sus_score == null || editSus);

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-6">
      <div>
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <FlaskConical className="w-7 h-7" />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Pilot Çalışma</h1>
          {isAdmin && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/pilot/report">
                <BarChart3 className="w-3.5 h-3.5" /> Pilot raporu
              </Link>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          DeepInsight&apos;ın mülakat hazırlığına etkisini ölçüyoruz. Katılım gönüllüdür ve platformu kullanmanızı etkilemez.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {status && (
        <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
          <h2 className="font-bold text-foreground text-sm flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Araştırma onamı
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{status.consent_text}</p>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {status.consent ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="w-4 h-4" /> Pilot çalışmaya katılıyorsunuz
                </span>
                {confirmLeave ? (
                  <span className="text-xs">
                    Anket yanıtlarınız silinecek.{" "}
                    <button onClick={() => handleConsent(false)} disabled={saving} className="font-bold text-destructive hover:underline">
                      Ayrıl
                    </button>
                    <button onClick={() => setConfirmLeave(false)} className="ml-2 text-muted-foreground hover:underline">Vazgeç</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmLeave(true)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Onamımı geri çek
                  </button>
                )}
              </>
            ) : (
              <Button onClick={() => handleConsent(true)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Okudum, katılmak istiyorum
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Onam metni sürümü: {status.consent_version}</p>
        </div>
      )}

      {status?.consent && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Tamamlanan mülakat" value={String(status.completed_interviews)}>
              <span className="text-xs text-muted-foreground">önce/sonra karşılaştırması için en az 2</span>
            </StatTile>
            <StatTile label="Kullanılabilirlik (SUS)" value={status.sus_score != null ? `${Math.round(status.sus_score)}/100` : "—"}>
              <span className="text-xs text-muted-foreground">{status.sus_score != null ? "anket tamamlandı" : "anket bekleniyor"}</span>
            </StatTile>
          </div>

          {status.completed_interviews === 0 && (
            <div className="bg-card border border-border rounded-3xl p-6 text-sm text-muted-foreground">
              Henüz tamamlanmış mülakatınız yok.{" "}
              <Link href="/chat/text" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                İlk mülakatınıza başlayın <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {status.pending_surveys.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">
                Değerlendirilmemiş mülakatlar ({status.pending_surveys.length})
              </h2>
              {status.pending_surveys.map((s) => (
                <PostInterviewSurvey
                  key={s.id}
                  interviewId={s.id}
                  items={status.post_items}
                  title={`${s.role ?? "Mülakat"} · ${s.topic ?? ""} — ${formatDate(s.created_at)}`}
                />
              ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
            <h2 className="font-bold text-foreground text-sm">Kullanılabilirlik anketi (SUS)</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Platformu birkaç kez kullandıktan sonra doldurun. 10 standart madde, yaklaşık 2 dakika.
            </p>
            {susResult && (
              <p role="status" className="mt-3 text-sm font-semibold text-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Kaydedildi — SUS puanınız {susResult.score} ({susResult.grade}).
              </p>
            )}
            {showSusForm ? (
              <div className="mt-3">
                {status.sus_items.map((item, i) => (
                  <LikertItem
                    key={i}
                    name={`sus-${i}`}
                    label={`${i + 1}. ${item}`}
                    value={sus[i]}
                    onChange={(v) => setSus((prev) => prev.map((x, j) => (j === i ? v : x)))}
                  />
                ))}
                <Button className="mt-4" onClick={handleSus} disabled={saving || sus.some((v) => v === undefined)}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Anketi gönder
                </Button>
              </div>
            ) : (
              !susResult && (
                <button onClick={() => setEditSus(true)} className="mt-3 text-xs font-semibold text-primary hover:underline">
                  Yanıtlarımı güncelle
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
