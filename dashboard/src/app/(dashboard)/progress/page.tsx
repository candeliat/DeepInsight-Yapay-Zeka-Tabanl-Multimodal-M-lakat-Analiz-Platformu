"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Loader2, XCircle, Download, Play } from "lucide-react";
import { progressService, Progress } from "@/services/progressService";
import { Button } from "@/components/ui/Button";
import { ProgressView } from "@/components/progress/ProgressView";
import { PracticeSetPanel } from "@/components/progress/PracticeSetPanel";

export default function ProgressPage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    progressService
      .getMyProgress()
      .then(setProgress)
      .catch((e) => setError(e instanceof Error ? e.message : "Yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await progressService.downloadReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rapor indirilemedi.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <TrendingUp className="w-7 h-7" />
          </div>
          <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Gelişimim</h1>
          <p className="text-sm text-muted-foreground mt-1">Mülakat skorlarınızın zaman içindeki değişimi, zayıf konularınız ve öneriler.</p>
        </div>
        {progress && progress.completed_count > 0 && (
          <Button variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF raporu indir
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : !progress || progress.completed_count === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Henüz tamamlanmış bir mülakatınız yok. İlk mülakatınızdan sonra gelişiminiz burada görünecek.</p>
          <Button asChild>
            <Link href="/chat/text">
              <Play className="w-4 h-4 fill-current" /> İlk mülakatına başla
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ProgressView progress={progress} />
          <PracticeSetPanel />
        </>
      )}
    </div>
  );
}
