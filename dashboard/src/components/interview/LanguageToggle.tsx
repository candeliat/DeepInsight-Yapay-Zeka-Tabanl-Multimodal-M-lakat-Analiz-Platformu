"use client";

import React from "react";
import type { InterviewLanguage } from "@/services/chatService";

const OPTIONS: { value: InterviewLanguage; label: string }[] = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "English" },
];

/** Mülakatın konuşma dili. İngilizcede sorular İngilizce sorulur, değerlendirme metni Türkçe kalır. */
export function LanguageToggle({ value, onChange }: { value: InterviewLanguage; onChange: (v: InterviewLanguage) => void }) {
  return (
    <div className="space-y-2">
      <span id="interview-language-label" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">
        Mülakat Dili
      </span>
      <div className="flex gap-2" role="group" aria-labelledby="interview-language-label">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs tracking-wider transition-all cursor-pointer ${
              value === o.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === "en" && (
        <p className="text-xs text-muted-foreground ml-1 leading-relaxed">
          Sorular İngilizce sorulur, cevaplarınızı İngilizce verin. Kelime puanı İngilizce iletişiminizi ölçer; geri
          bildirim Türkçe ve İngilizceniz için bir öneri içerir.
        </p>
      )}
    </div>
  );
}
