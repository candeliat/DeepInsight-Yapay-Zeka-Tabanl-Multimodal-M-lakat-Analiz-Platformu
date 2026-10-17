"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bug, ChevronDown, ExternalLink, Lightbulb, Loader2, Monitor, Plus, Smartphone } from "lucide-react";
import {
  AdminFeedback, FeedbackKind, FeedbackStatus, feedbackService, KIND_LABEL, STATUS_LABEL,
} from "@/services/feedbackService";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

const STATUSES = Object.keys(STATUS_LABEL) as FeedbackStatus[];
const STATUS_TONE: Record<FeedbackStatus, string> = {
  new: "bg-primary/10 text-primary",
  triaged: "bg-warning/10 text-warning",
  planned: "bg-muted text-foreground",
  resolved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

function FeedbackCard({ item, onChange }: { item: AdminFeedback; onChange: (f: AdminFeedback) => void }) {
  const [note, setNote] = useState(item.admin_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = item.kind === "bug" ? Bug : Lightbulb;

  const save = async (patch: { status?: FeedbackStatus; admin_note?: string }) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await feedbackService.adminUpdate(item.id, patch);
      onChange({ ...item, status: updated.status, admin_note: updated.admin_note });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Icon className={`w-4 h-4 shrink-0 ${item.kind === "bug" ? "text-destructive" : "text-warning"}`} aria-hidden />
            {item.title}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {KIND_LABEL[item.kind]} · {item.user_name ?? "—"} {item.user_email ? `(${item.user_email})` : "(silinmiş hesap)"} ·{" "}
            {item.created_at ? new Date(item.created_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {item.platform === "mobile" ? <Smartphone className="w-3 h-3" aria-hidden /> : <Monitor className="w-3 h-3" aria-hidden />}
            {item.platform === "mobile" ? "Mobil" : item.platform === "web" ? "Web" : "—"}
            {item.page && <> · Sayfa: {item.page}</>}
          </p>
        </div>
        <select
          value={item.status}
          onChange={(e) => save({ status: e.target.value as FeedbackStatus })}
          disabled={saving}
          className={`h-8 px-2 rounded-lg text-xs font-bold border-0 ${STATUS_TONE[item.status]}`}
          aria-label={`${item.title} durumu`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-foreground/90 mt-3 whitespace-pre-wrap">{item.description}</p>

      {item.screenshot_url ? (
        <a href={item.screenshot_url} target="_blank" rel="noreferrer" className="inline-block mt-3 group" title="Tam boyut aç">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.screenshot_url} alt={`${item.title} ekran görüntüsü`} className="max-h-56 rounded-xl border border-border group-hover:opacity-90" />
          <span className="text-xs text-primary inline-flex items-center gap-1 mt-1">
            <ExternalLink className="w-3 h-3" /> Tam boyut
          </span>
        </a>
      ) : item.has_screenshot ? (
        <p className="text-xs text-muted-foreground mt-2">Ekran görüntüsü şu an açılamadı.</p>
      ) : null}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Not (kullanıcı da görür), örn. 'PR #26 ile düzeltildi'"
          maxLength={2000}
          className="min-h-[44px] text-xs flex-1"
          aria-label={`${item.title} notu`}
        />
        <Button size="sm" variant="outline" onClick={() => save({ admin_note: note })} disabled={saving || note === (item.admin_note ?? "")}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Notu kaydet
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive mt-2">{error}</p>}
    </li>
  );
}

/** Admin: tüm geri bildirimler (kim, ne, nerede, ekran görüntüsü) + durum yönetimi + adminin kendi bildirimi. */
export function AdminFeedbackTab() {
  const [kind, setKind] = useState<FeedbackKind | "">("");
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [items, setItems] = useState<AdminFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(
    () =>
      feedbackService
        .adminList({ kind: kind || undefined, status: status || undefined })
        .then((list) => {
          setItems(list);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Geri bildirimler yüklenemedi.")),
    [kind, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const counts = (items ?? []).reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.status]: (acc[f.status] ?? 0) + 1 }), {});

  return (
    <div className="space-y-6">
      <section className="bg-card border border-border rounded-3xl shadow-sm p-6" aria-label="Geri bildirim gönder">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-between font-bold text-foreground text-sm"
          aria-expanded={showForm}
        >
          <span className="flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Geri bildirim ekle</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showForm ? "rotate-180" : ""}`} />
        </button>
        {showForm && (
          <div className="mt-4">
            <FeedbackForm onSent={load} />
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-3xl shadow-sm p-6" aria-label="Gelen geri bildirimler">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="font-bold text-foreground text-sm">Gelen geri bildirimler ({items?.length ?? "…"})</h2>
          <div className="flex items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind | "")} className="h-9 px-3 rounded-xl border border-border bg-background text-sm" aria-label="Tür filtresi">
              <option value="">Tüm türler</option>
              <option value="bug">Hata bildirimleri</option>
              <option value="feature">Özellik önerileri</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | "")} className="h-9 px-3 rounded-xl border border-border bg-background text-sm" aria-label="Durum filtresi">
              <option value="">Tüm durumlar</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        {!status && items && items.length > 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            {STATUSES.filter((s) => counts[s]).map((s) => `${STATUS_LABEL[s]}: ${counts[s]}`).join(" · ")}
          </p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : !items ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu filtrede geri bildirim yok.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((f) => (
              <FeedbackCard key={f.id} item={f} onChange={(u) => setItems((prev) => prev?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
