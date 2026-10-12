"use client";

import React, { useState } from "react";
import { Loader2, CheckCircle2, FlaskConical } from "lucide-react";
import { pilotService, PostItemKey } from "@/services/pilotService";
import { LikertItem } from "./Likert";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

/** Mülakat sonrası 3 maddelik pilot anketi. Yalnızca pilot katılımcısına gösterilir. */
export function PostInterviewSurvey({
  interviewId,
  items,
  title,
  onDone,
}: {
  interviewId: string;
  items: { key: PostItemKey; label: string }[];
  title?: string;
  onDone?: () => void;
}) {
  const [answers, setAnswers] = useState<Partial<Record<PostItemKey, number>>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = items.every((i) => answers[i.key]);

  const handleSubmit = async () => {
    if (!complete) return;
    setSaving(true);
    setError(null);
    try {
      await pilotService.submitPostInterview(interviewId, answers as Record<PostItemKey, number>, comment.trim());
      setDone(true);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anket gönderilemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-success font-semibold">
        <CheckCircle2 className="w-4 h-4" /> Teşekkürler, yanıtınız kaydedildi.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left">
      <p className="font-bold text-foreground text-sm flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-primary" /> {title ?? "Pilot çalışma: bu mülakatı değerlendirin"}
      </p>
      <p className="text-xs text-muted-foreground mt-1">30 saniye sürer. Yanıtlarınız kimliksiz olarak araştırmada kullanılır.</p>
      <div className="mt-2">
        {items.map((item) => (
          <LikertItem
            key={item.key}
            name={`${interviewId}-${item.key}`}
            label={item.label}
            value={answers[item.key]}
            onChange={(v) => setAnswers((a) => ({ ...a, [item.key]: v }))}
          />
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        placeholder="Eklemek istediğiniz bir şey var mı? (opsiyonel)"
        className="mt-3 min-h-[60px] text-sm"
        aria-label="Yorum (opsiyonel)"
      />
      {error && <p role="alert" className="text-xs text-destructive font-semibold mt-2">{error}</p>}
      <Button size="sm" className="mt-3" onClick={handleSubmit} disabled={!complete || saving}>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Gönder
      </Button>
    </div>
  );
}
