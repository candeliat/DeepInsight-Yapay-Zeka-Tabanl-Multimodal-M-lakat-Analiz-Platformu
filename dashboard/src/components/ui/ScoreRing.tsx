import React from "react";

/** 0-100 arası bir skoru halka olarak gösterir. Renk ve etiket eşiklere göre (>=80, >=55) seçilir. */
export function ScoreRing({
  score,
  labels = ["Güçlü", "Geliştirilebilir", "Zayıf"],
  ariaLabel,
}: {
  score: number;
  labels?: [string, string, string];
  ariaLabel?: string;
}) {
  const tone =
    score >= 80
      ? { text: "text-success", stroke: "stroke-success", label: labels[0] }
      : score >= 55
        ? { text: "text-warning", stroke: "stroke-warning", label: labels[1] }
        : { text: "text-destructive", stroke: "stroke-destructive", label: labels[2] };
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative w-36 h-36 shrink-0" role="img" aria-label={ariaLabel ?? `Skor ${score} / 100`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-muted" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className={`fill-none ${tone.stroke} transition-all duration-700`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-serif text-4xl ${tone.text}`}>{score}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center px-2">{tone.label}</span>
      </div>
    </div>
  );
}
