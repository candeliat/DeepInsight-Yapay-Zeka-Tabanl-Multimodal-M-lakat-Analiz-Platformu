"use client";

import React, { useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { orgService, OrgUsage } from "@/services/orgService";

const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Son 6 ay (TR saatiyle), en yeni önce: "2026-10". */
function recentMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
    };
  });
}

/** Kurum yöneticisi için aylık yapay zekâ kullanımı ve tahmini maliyet. */
export function UsagePanel({ orgId }: { orgId: string }) {
  const months = recentMonths();
  const [month, setMonth] = useState(months[0].value);
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    orgService
      .usage(orgId, month)
      .then((u) => active && (setUsage(u), setError(null)))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Kullanım raporu yüklenemedi."));
    return () => {
      active = false;
    };
  }, [orgId, month]);

  const loading = !error && (!usage || usage.month !== month);
  const cost =
    usage?.estimated_cost_usd == null
      ? "Hesaplanmadı"
      : `$${fmt(usage.estimated_cost_usd, 2)}`;

  return (
    <section aria-labelledby="usage-heading" className="bg-card border border-border rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 id="usage-heading" className="font-bold text-foreground text-sm flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" /> Yapay zekâ kullanımı ve maliyet
        </h2>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 px-3 rounded-xl border border-border bg-background text-sm"
          aria-label="Ay"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Yalnızca kurum adına başlatılan mülakatların çağrıları sayılır; öğrencilerin bireysel mülakatları ve CV/ilan analizleri dahil değildir.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : loading || !usage ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : usage.calls === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bu ay kurum adına yapay zekâ çağrısı kaydı yok
          {usage.interviews_started > 0 && ` (${usage.interviews_started} mülakat başlatıldı; kullanım kaydı bu özellikten sonra tutulmaya başladı)`}.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              ["Mülakat", `${fmt(usage.interviews_started)}${usage.quota ? ` / ${fmt(usage.quota)}` : ""}`],
              ["Model çağrısı", `${fmt(usage.calls)}`],
              ["Token", fmt(usage.total_tokens)],
              ["Tahmini maliyet", cost],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-muted/50 px-4 py-3">
                <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold text-foreground tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground mb-3">
            Başarı oranı %{fmt(usage.success_rate, 1)} ({fmt(usage.failed_calls)} başarısız deneme) · mülakat başına {fmt(usage.tokens_per_interview)} token (kullanım kaydı olan {fmt(usage.metered_interviews)} mülakat)
            {usage.unpriced_models.length > 0 && (
              <> · Fiyatı tanımlı olmayan model: {usage.unpriced_models.join(", ")} (maliyet {usage.estimated_cost_usd == null ? "hesaplanmadı" : "eksik"})</>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Model</th>
                  <th className="py-2 pr-3 font-semibold text-right">Çağrı</th>
                  <th className="py-2 pr-3 font-semibold text-right">Başarısız</th>
                  <th className="py-2 pr-3 font-semibold text-right">Ort. süre</th>
                  <th className="py-2 pr-3 font-semibold text-right">Token</th>
                  <th className="py-2 font-semibold text-right">Maliyet</th>
                </tr>
              </thead>
              <tbody>
                {usage.by_model.map((m) => (
                  <tr key={m.model} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{m.model}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(m.calls)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(m.failed)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.avg_latency_ms == null ? "—" : `${fmt(m.avg_latency_ms / 1000, 1)} sn`}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(m.prompt_tokens + m.completion_tokens)}</td>
                    <td className="py-2 text-right tabular-nums">{m.estimated_cost_usd == null ? "tanımsız" : `$${fmt(m.estimated_cost_usd, 2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
