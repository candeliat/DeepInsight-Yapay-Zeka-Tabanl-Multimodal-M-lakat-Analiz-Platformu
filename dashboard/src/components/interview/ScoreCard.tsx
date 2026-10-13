"use client";

import React from "react";

// Mülakat sonu skor kartı (görüntülü ve yazılı mülakat sonuç ekranları).
const scoreToneClasses = {
  primary: { text: "text-primary", bg: "bg-primary/5", border: "border-primary/15" },
  success: { text: "text-success", bg: "bg-success/5", border: "border-success/15" },
  warning: { text: "text-warning", bg: "bg-warning/5", border: "border-warning/15" },
} as const;

export function ScoreCard({
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
