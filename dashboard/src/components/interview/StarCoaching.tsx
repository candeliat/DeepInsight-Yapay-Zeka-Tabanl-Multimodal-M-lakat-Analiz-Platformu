"use client";

import React from "react";
import { CheckCircle2, Circle, Lightbulb } from "lucide-react";
import type { StarAnalysis, StarComponent } from "@/services/chatService";

const PARTS: { key: StarComponent; letter: string; label: string }[] = [
  { key: "situation", letter: "S", label: "Durum" },
  { key: "task", letter: "T", label: "Görev" },
  { key: "action", letter: "A", label: "Eylem" },
  { key: "result", letter: "R", label: "Sonuç" },
];

export const BEHAVIORAL_TOPIC = "Davranışsal mülakat (STAR)";

/** Backend'deki question_tags ile aynı işaretler: konu davranışsal mülakat mı? */
export function isBehavioralTopic(topic: string): boolean {
  const t = topic.toLocaleLowerCase("tr").replace(/ş/g, "s").replace(/ı/g, "i");
  return t.includes("davranissal") || t.includes("behavioral") || /\bstar\b/.test(t);
}

/** Bir davranışsal cevabın STAR koçluk notu: hangi öğeler var ve en fazla 3 ipucu. */
export function StarCoachingCard({ star }: { star: StarAnalysis }) {
  return (
    <div className="mt-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-left" aria-label="STAR koçluğu">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-primary mr-1">STAR</span>
        {PARTS.map(({ key, letter, label }) => {
          const ok = star.components[key];
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              }`}
              title={ok ? `${label} var` : `${label} eksik`}
            >
              {ok ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
              {letter} · {label}
              <span className="sr-only">{ok ? " var" : " eksik"}</span>
            </span>
          );
        })}
      </div>
      {star.tips.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {star.tips.map((tip) => (
            <li key={tip} className="flex gap-2 text-xs text-foreground/80 leading-relaxed">
              <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning" />
              {tip}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-success font-semibold">Tam bir STAR cevabı: durum, görev, kendi eylemlerin ve ölçülebilir sonuç.</p>
      )}
    </div>
  );
}

/** Mülakat boyunca STAR öğelerinin kaç cevapta yer aldığı. */
export function StarSummary({ analyses }: { analyses: StarAnalysis[] }) {
  if (analyses.length === 0) return null;
  const n = analyses.length;
  const coverage = PARTS.map((p) => ({ ...p, count: analyses.filter((a) => a.components[p.key]).length }));
  const weakest = [...coverage].sort((a, b) => a.count - b.count)[0];
  const average = Math.round(analyses.reduce((sum, a) => sum + a.score, 0) / n);

  return (
    <div className="bg-card border border-border rounded-3xl shadow-sm p-6 text-left" aria-label="STAR özeti">
      <h3 className="font-bold text-foreground text-sm mb-1">STAR yapısı</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {n} cevabın ortalama STAR kapsamı: <span className="font-semibold text-foreground">{average}/100</span>. Kural tabanlı bir koçluk
        ipucudur, puanınıza eklenmez.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {coverage.map(({ key, letter, label, count }) => (
          <div key={key} className="rounded-2xl border border-border p-3 text-center">
            <div className="text-xs font-bold text-muted-foreground">{letter} · {label}</div>
            <div className="font-serif text-2xl text-foreground">
              {count}<span className="font-sans text-xs text-muted-foreground">/{n}</span>
            </div>
          </div>
        ))}
      </div>
      {weakest.count < n && (
        <p className="mt-4 text-sm text-foreground">
          En sık eksik kalan: <span className="font-semibold">{weakest.label}</span>. Bir sonraki pratikte bu öğeye odaklanın.
        </p>
      )}
    </div>
  );
}
