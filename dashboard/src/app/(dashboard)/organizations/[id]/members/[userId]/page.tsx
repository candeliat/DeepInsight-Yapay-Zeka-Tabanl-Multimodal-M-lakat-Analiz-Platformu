"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, TrendingUp } from "lucide-react";
import { orgService } from "@/services/orgService";
import { Progress } from "@/services/progressService";
import { ProgressView } from "@/components/progress/ProgressView";

/** Eğitmen görünümü: öğrencinin kurum adına yaptığı mülakatlardaki gelişimi (yalnızca öğrenci paylaşım izni verdiyse). */
export default function MemberProgressPage() {
  const { id: orgId, userId } = useParams<{ id: string; userId: string }>();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgService
      .memberProgress(orgId, userId)
      .then(setProgress)
      .catch((e) => setError(e instanceof Error ? e.message : "Yüklenemedi."))
      .finally(() => setLoading(false));
  }, [orgId, userId]);

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <Link href={`/organizations/${orgId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Kurum paneline dön
      </Link>
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <TrendingUp className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Öğrenci gelişimi</h1>
        <p className="text-sm text-muted-foreground mt-1">Yalnızca kurum adına yapılan mülakatlar; öğrenci bu paylaşımı istediği zaman kapatabilir.</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error || !progress ? (
        <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          {error ?? "Veri yok."}
        </div>
      ) : progress.completed_count === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center text-sm text-muted-foreground">Bu öğrencinin kurum adına tamamlanmış mülakatı yok.</div>
      ) : (
        <ProgressView progress={progress} allowPractice={false} />
      )}
    </div>
  );
}
