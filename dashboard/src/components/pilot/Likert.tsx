"use client";

import React from "react";

const LABELS = ["Kesinlikle katılmıyorum", "Katılmıyorum", "Kararsızım", "Katılıyorum", "Kesinlikle katılıyorum"];

/** 1-5 Likert maddesi: radyo grubu, uçlarda sözlü etiket (yalnızca sayı değil). */
export function LikertItem({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="py-3 border-b border-border/60 last:border-0">
      <legend className="text-sm text-foreground mb-2">{label}</legend>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-16 shrink-0 leading-tight">Katılmıyorum</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} — ${LABELS[n - 1]}`}
              title={LABELS[n - 1]}
              onClick={() => onChange(n)}
              className={`w-9 h-9 rounded-xl border-2 text-sm font-bold transition-colors ${
                value === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
              }`}
              data-name={name}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground w-16 shrink-0 leading-tight text-right">Katılıyorum</span>
      </div>
    </fieldset>
  );
}
