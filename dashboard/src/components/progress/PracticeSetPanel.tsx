"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Dumbbell, Loader2, Play, RefreshCw } from "lucide-react";
import { PracticeSet, progressService } from "@/services/progressService";
import { Button } from "@/components/ui/Button";

/** Pratik setinden mülakat bağlantısı: rol/konu setin konularından, sorular sırasıyla. */
export function practiceInterviewHref(set: PracticeSet) {
  const first = set.topics[0];
  const params = new URLSearchParams({
    role: first?.role || "Yazılım Mühendisi",
    topic: set.topics.map((t) => t.topic).join(" ve ").slice(0, 120),
    practice: set.items.map((i) => i.id).join(","),
  });
  if (first?.difficulty) params.set("difficulty", first.difficulty);
  return `/chat/text?${params.toString()}`;
}

/** Zayıf konular için soru bankasından seçilmiş, daha önce görülmemiş sorular ve iyi cevap maddeleri. */
export function PracticeSetPanel() {
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let active = true;
    progressService
      .getPracticeSet()
      .then((s) => active && setSet(s))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Pratik seti yüklenemedi."));
    return () => {
      active = false;
    };
  }, []);

  const reload = async () => {
    setReloading(true);
    setError(null);
    try {
      setSet(await progressService.getPracticeSet());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pratik seti yüklenemedi.");
    } finally {
      setReloading(false);
    }
  };

  return (
    <section aria-labelledby="practice-heading" className="bg-card border border-border rounded-3xl shadow-sm p-6 mt-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 id="practice-heading" className="font-bold text-foreground text-sm flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary" /> Pratik seti
        </h2>
        {set && set.items.length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={reload} disabled={reloading} title="Bankadan yeniden seç">
              {reloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
            </Button>
            <Button size="sm" asChild>
              <Link href={practiceInterviewHref(set)}>
                <Play className="w-3.5 h-3.5 fill-current" /> Bu setle mülakat yap
              </Link>
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : !set ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : set.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {set.reason === "no_history"
            ? "Pratik seti, tamamlanmış mülakatlarınızdaki konulara göre hazırlanır."
            : `Soru bankasında bu konular için uygun soru bulunamadı${set.unmatched_topics.length ? ` (${set.unmatched_topics.join(", ")})` : ""}. Öneriler kısmındaki "Pratik yap" ile yine pratik yapabilirsiniz.`}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            En zayıf konularınızdan ({set.topics.map((t) => `${t.topic}: ${Math.round(t.average ?? 0)}`).join(", ")}) soru bankasından seçildi;
            mümkünse daha önce karşılaşmadığınız sorular. Önce kendiniz cevaplayın, sonra iyi bir cevapta olması gerekenlere bakın.
          </p>
          <ol className="space-y-3">
            {set.items.map((item, i) => (
              <li key={item.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-muted-foreground mb-1.5">
                  <span>{i + 1}.</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-foreground">{item.topic}</span>
                  {item.difficulty && <span>{item.difficulty}</span>}
                </div>
                <p className="text-sm text-foreground">{item.question_text}</p>
                {item.answer_points.length > 0 ? (
                  <details className="mt-2 group">
                    <summary className="text-xs font-semibold text-primary cursor-pointer list-none inline-flex items-center gap-1">
                      <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" aria-hidden />
                      İyi bir cevapta olması gerekenler
                    </summary>
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-foreground/90">
                      {item.answer_points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">Bu soru için hazır cevap maddesi yok.</p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
