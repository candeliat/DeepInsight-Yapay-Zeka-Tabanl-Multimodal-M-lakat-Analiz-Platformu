"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bug, CheckCircle2, ImagePlus, Lightbulb, Loader2, Send, X } from "lucide-react";
import { FeedbackKind, feedbackService, MAX_SCREENSHOT_BYTES } from "@/services/feedbackService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/** Hata bildirimi / özellik önerisi formu; ekran görüntüsü dosyadan seçilir ya da panodan yapıştırılır (Ctrl+V). */
export function FeedbackForm({ defaultPage, onSent }: { defaultPage?: string; onSent?: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState(defaultPage ?? "");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (screenshot ? URL.createObjectURL(screenshot) : null), [screenshot]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const attach = (file: File | null | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Ekran görüntüsü PNG, JPG ya da WEBP olmalı.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError("Ekran görüntüsü en fazla 5 MB olabilir.");
      return;
    }
    setError(null);
    setScreenshot(file);
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      attach(item.getAsFile());
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await feedbackService.send({ kind, title: title.trim(), description: description.trim(), page: page.trim() || undefined, screenshot });
      setSent(true);
      setTitle("");
      setDescription("");
      removeScreenshot();
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} onPaste={onPaste} className="space-y-4" aria-label="Geri bildirim formu">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tür">
        {([
          ["bug", "Hata bildirimi", "Bir şey çalışmıyor ya da yanlış görünüyor", Bug],
          ["feature", "Özellik önerisi", "Bir şey eklensin ya da daha iyi olsun", Lightbulb],
        ] as const).map(([value, label, hint, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={`text-left rounded-2xl border-2 p-4 transition-colors ${
              kind === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
            }`}
          >
            <span className="flex items-center gap-2 font-bold text-sm text-foreground">
              <Icon className={`w-4 h-4 ${kind === value ? "text-primary" : "text-muted-foreground"}`} aria-hidden /> {label}
            </span>
            <span className="block text-xs text-muted-foreground mt-1">{hint}</span>
          </button>
        ))}
      </div>

      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kısa başlık" minLength={3} maxLength={150} required aria-label="Başlık" />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={kind === "bug" ? "Ne yaptınız, ne bekliyordunuz, ne oldu?" : "Ne olsun, neden işinize yarar?"}
        minLength={5}
        maxLength={4000}
        required
        className="min-h-[120px] text-sm"
        aria-label="Açıklama"
      />
      <Input value={page} onChange={(e) => setPage(e.target.value)} placeholder="Hangi sayfa? (örn. İlan Eşleştirme)" maxLength={300} aria-label="Sayfa" />

      <div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          id="feedback-screenshot"
          onChange={(e) => attach(e.target.files?.[0])}
        />
        {preview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Eklenen ekran görüntüsü" className="max-h-48 rounded-xl border border-border" />
            <button
              type="button"
              onClick={removeScreenshot}
              className="absolute -top-2 -right-2 bg-card border border-border rounded-full p-1 shadow"
              aria-label="Ekran görüntüsünü kaldır"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <label htmlFor="feedback-screenshot" className="flex items-center gap-2 cursor-pointer rounded-2xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
            <ImagePlus className="w-4 h-4" aria-hidden /> Ekran görüntüsü ekle (isteğe bağlı) — dosya seçin ya da Ctrl+V ile yapıştırın
          </label>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {sent && !error && (
        <p role="status" className="text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Teşekkürler, geri bildiriminiz alındı.
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gönder
      </Button>
    </form>
  );
}
