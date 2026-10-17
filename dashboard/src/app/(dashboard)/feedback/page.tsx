"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MessageSquareText, Loader2 } from "lucide-react";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { feedbackService, KIND_LABEL, MyFeedback, STATUS_LABEL } from "@/services/feedbackService";

export default function FeedbackPage() {
  const [items, setItems] = useState<MyFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      feedbackService
        .mine()
        .then((list) => {
          setItems(list);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Yüklenemedi.")),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-6">
      <div>
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <MessageSquareText className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Geri Bildirim</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bir hata mı buldunuz ya da bir fikriniz mi var? Ekran görüntüsüyle birlikte gönderin; durumunu aşağıdan takip edebilirsiniz.
        </p>
      </div>

      <section className="bg-card border border-border rounded-3xl shadow-sm p-6">
        <FeedbackForm onSent={load} />
      </section>

      <section aria-labelledby="my-feedback" className="bg-card border border-border rounded-3xl shadow-sm p-6">
        <h2 id="my-feedback" className="font-bold text-foreground text-sm mb-4">Gönderdiklerim</h2>
        {error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : !items ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz geri bildirim göndermediniz.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((f) => (
              <li key={f.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-semibold text-foreground text-sm">{f.title}</p>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-muted text-foreground">{STATUS_LABEL[f.status]}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {KIND_LABEL[f.kind]} · {f.created_at ? new Date(f.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : ""}
                </p>
                {f.admin_note && <p className="text-xs text-foreground mt-2 bg-primary/5 rounded-lg px-3 py-2">Ekipten not: {f.admin_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
