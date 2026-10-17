"use client";

import React, { useState } from "react";
import { AlertTriangle, Check, Copy, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { CoverLetter, CoverLetterLanguage, CoverLetterTone, jobService } from "@/services/jobService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`flex-1 h-9 rounded-xl border-2 text-xs font-bold transition-colors ${
              value === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Seçili ilan + CV için ön yazı taslağı. Kaydedilmez: düzenlenir, kopyalanır ya da .txt indirilir. */
export function CoverLetterPanel({ jobId, cvId, jobTitle }: { jobId: string; cvId: string; jobTitle: string | null }) {
  const [language, setLanguage] = useState<CoverLetterLanguage>("tr");
  const [tone, setTone] = useState<CoverLetterTone>("resmi");
  const [note, setNote] = useState("");
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await jobService.coverLetter(jobId, { cv_id: cvId, language, tone, note: note.trim() || undefined });
      setLetter(result);
      setSubject(result.subject);
      setBody(result.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ön yazı hazırlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Panoya kopyalanamadı; metni seçip elle kopyalayın.");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${subject}\n\n${body}\n`], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `on-yazi${jobTitle ? `-${jobTitle}` : ""}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="cover-letter-heading" className="bg-card border border-border rounded-3xl shadow-sm p-6 space-y-4">
      <div>
        <h3 id="cover-letter-heading" className="font-bold text-foreground text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Ön yazı (motivasyon mektubu)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Seçili CV ve bu ilana göre bir taslak hazırlanır. Yalnızca CV&apos;nizdeki bilgiler kullanılır; göndermeden önce okuyup düzenleyin.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Choice label="Dil" value={language} options={[["tr", "Türkçe"], ["en", "English"]]} onChange={setLanguage} />
        <Choice label="Ton" value={tone} options={[["resmi", "Resmi"], ["samimi", "Samimi"]]} onChange={setTone} />
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Öne çıkarmak istediğiniz bir nokta (opsiyonel), örn. &quot;bitirme projemi vurgula&quot;"
        className="min-h-[60px] text-sm"
        aria-label="Öne çıkarmak istediğiniz nokta"
      />
      <Button onClick={generate} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : letter ? <RefreshCw className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        {busy ? "Hazırlanıyor..." : letter ? "Yeniden oluştur" : "Ön yazı oluştur"}
      </Button>

      {busy && (
        <p className="text-xs text-muted-foreground" aria-live="polite">Yapay zekâ ile hazırlanıyor; 1-2 dakika sürebilir.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      {letter && (
        <div className="space-y-3 pt-2 border-t border-border">
          {letter.warnings.length > 0 && (
            <div role="status" className="rounded-2xl bg-warning/10 border border-warning/30 px-4 py-3 space-y-1">
              {letter.warnings.map((w) => (
                <p key={w} className="text-xs text-foreground flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden /> {w}
                </p>
              ))}
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Konu</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Metin</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[360px] text-sm leading-relaxed" />
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Kopyalandı" : "Kopyala"}
            </Button>
            <Button size="sm" variant="outline" onClick={download}>
              <Download className="w-3.5 h-3.5" /> .txt indir
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">{body.split(/\s+/).filter(Boolean).length} kelime</span>
          </div>
          {letter.highlighted_skills.length > 0 && (
            <p className="text-xs text-muted-foreground">Öne çıkarılan beceriler: {letter.highlighted_skills.join(", ")}</p>
          )}
        </div>
      )}
    </section>
  );
}
