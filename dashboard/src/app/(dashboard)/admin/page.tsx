"use client";

import React, { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cpu, Loader2, ShieldCheck, Boxes, CircleAlert, CircleCheck } from "lucide-react";
import { adminService, AdminOverview, AdminUsage, AiInventory } from "@/services/adminService";
import { useAuthStore } from "@/store/useAuthStore";
import { StatTile } from "@/components/progress/ProgressView";

const BAR = "#2a78d6";
const AXIS = "#898781";
const GRID = "#e1e0d9";
const TABS = [
  ["usage", "Yapay zekâ kullanımı"],
  ["inventory", "Yapay zekâ envanteri"],
] as const;
type Tab = (typeof TABS)[number][0];

const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const cost = (v: number | null | undefined) => (v == null ? "tanımsız" : `$${fmt(v, 2)}`);

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

function Table({ head, rows, numericFrom = 1 }: { head: string[]; rows: React.ReactNode[][]; numericFrom?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 font-semibold ${i >= numericFrom ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {r.map((c, j) => (
                <td key={j} className={`py-2 pr-3 ${j >= numericFrom ? "text-right tabular-nums" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-3xl shadow-sm p-6" aria-label={title}>
      <h2 className="font-bold text-foreground text-sm">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function UsageTab() {
  const months = recentMonths();
  const [month, setMonth] = useState(months[0].value);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminService
      .usage(month)
      .then((u) => active && (setUsage(u), setError(null)))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Kullanım verisi yüklenemedi."));
    return () => {
      active = false;
    };
  }, [month]);

  const loading = !error && (!usage || usage.month !== month);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label htmlFor="admin-month" className="text-xs font-semibold text-muted-foreground">Ay</label>
        <select id="admin-month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 px-3 rounded-xl border border-border bg-background text-sm">
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : !usage || loading ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Model çağrısı" value={fmt(usage.calls)}>
              <span className="text-xs text-muted-foreground">%{fmt(usage.success_rate, 1)} başarılı · {fmt(usage.failed_calls)} başarısız</span>
            </StatTile>
            <StatTile label="Token" value={fmt(usage.total_tokens)}>
              <span className="text-xs text-muted-foreground">{fmt(usage.prompt_tokens)} girdi · {fmt(usage.completion_tokens)} çıktı</span>
            </StatTile>
            <StatTile label="Tahmini maliyet" value={usage.estimated_cost_usd == null ? "Hesaplanmadı" : cost(usage.estimated_cost_usd)}>
              {usage.unpriced_models.length > 0 && (
                <span className="text-xs text-muted-foreground">Fiyatı tanımsız: {usage.unpriced_models.join(", ")}</span>
              )}
            </StatTile>
            <StatTile label="Yapay zekâ kullanan kullanıcı" value={fmt(usage.active_users)}>
              <span className="text-xs text-muted-foreground">{fmt(usage.interviews_started)} mülakat başlatıldı</span>
            </StatTile>
          </div>

          <Card title="Günlük model çağrısı" subtitle="Her deneme bir çağrı; başarısız denemeler dahil (Türkiye saati)">
            {usage.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu ay kayıt yok.</p>
            ) : (
              <div className="h-56" role="img" aria-label={`Günlük model çağrısı, ${usage.daily.length} gün`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usage.daily.map((d) => ({ ...d, label: d.date.slice(8) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(11,11,11,0.04)" }}
                      contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 }}
                      itemStyle={{ color: "#0b0b0b" }}
                      labelFormatter={(_, payload) => (payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""}
                      formatter={(value, _name, item) => [
                        `${value} çağrı · ${fmt((item?.payload as { total_tokens: number } | undefined)?.total_tokens)} token`,
                        "Gün",
                      ]}
                    />
                    <Bar dataKey="calls" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="Özelliğe göre" subtitle="Yapay zekânın platformda nerede kullanıldığı">
              <Table
                head={["Özellik", "Çağrı", "Başarısız", "Ort. süre", "Token"]}
                rows={usage.by_feature.map((f) => [
                  f.feature,
                  fmt(f.calls),
                  fmt(f.failed),
                  f.avg_latency_ms == null ? "—" : `${fmt(f.avg_latency_ms / 1000, 1)} sn`,
                  fmt(f.total_tokens),
                ])}
              />
            </Card>
            <Card title="Kuruma göre" subtitle="Kurum bağlamı olmayan her şey (bireysel mülakat, CV, ilan, ön yazı) bireysel satırında">
              <Table
                head={["Kurum", "Kullanıcı", "Çağrı", "Token", "Maliyet"]}
                rows={usage.by_org.map((o) => [o.name, fmt(o.users), fmt(o.calls), fmt(o.total_tokens), cost(o.estimated_cost_usd)])}
              />
            </Card>
          </div>

          <Card title="Modele göre">
            <Table
              head={["Model", "Çağrı", "Başarısız", "Ort. süre", "Girdi token", "Çıktı token", "Maliyet"]}
              rows={usage.by_model.map((m) => [
                <span key={m.model} className="font-mono text-xs">{m.model}</span>,
                fmt(m.calls),
                fmt(m.failed),
                m.avg_latency_ms == null ? "—" : `${fmt(m.avg_latency_ms / 1000, 1)} sn`,
                fmt(m.prompt_tokens),
                fmt(m.completion_tokens),
                cost(m.estimated_cost_usd),
              ])}
            />
          </Card>
        </>
      )}
    </div>
  );
}

function InventoryTab() {
  const [inv, setInv] = useState<AiInventory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.inventory().then(setInv).catch((e) => setError(e instanceof Error ? e.message : "Envanter yüklenemedi."));
  }, []);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!inv) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <Card
        title="Dil modeli (LLM) zinciri"
        subtitle={`Sağlayıcı: ${inv.llm.provider} · sırayla denenir, biri başarısız olursa sıradakine geçilir · deneme sınırı ${inv.llm.attempt_timeout_s} sn (yapılandırılmış çıktıda ${inv.llm.json_attempt_timeout_s} sn)`}
      >
        <Table
          head={["Sıra", "Model", "Durum", "JSON modu", "Bu süreçte deneme / başarılı"]}
          numericFrom={4}
          rows={inv.llm.chain.map((c) => [
            c.order,
            <span key={c.model} className="font-mono text-xs">{c.model}</span>,
            c.circuit_open ? (
              <span key="s" className="inline-flex items-center gap-1 text-warning font-semibold">
                <CircleAlert className="w-3.5 h-3.5" aria-hidden /> Devre açık{c.reopens_in_s != null ? ` (${c.reopens_in_s} sn)` : ""}
              </span>
            ) : (
              <span key="s" className="inline-flex items-center gap-1 text-success font-semibold">
                <CircleCheck className="w-3.5 h-3.5" aria-hidden /> Kullanımda
              </span>
            ),
            c.json_mode ? "Açık" : "Kapalı (metinden ayıklanır)",
            c.since_start ? `${fmt(c.since_start.attempts)} / ${fmt(c.since_start.successes)}` : "—",
          ])}
        />
        <p className="text-xs text-muted-foreground mt-3">
          Ücretli yedek model: {inv.llm.paid_fallback_enabled ? "açık" : "kapalı"} · Model fiyatları: {inv.llm.prices_configured ? "tanımlı" : "tanımlı değil (maliyet hesaplanmaz)"}. {inv.note}
        </p>
      </Card>

      <Card title="Dil modelinin kullanıldığı yerler" subtitle="Her satır kullanım kaydında ayrı bir amaç (purpose) olarak tutulur">
        <Table
          head={["Özellik", "Ne yapıyor", "Kayıt adı"]}
          numericFrom={3}
          rows={inv.llm.purposes.map((p) => [p.feature, p.where, <code key={p.purpose} className="text-xs">{p.purpose}</code>])}
        />
      </Card>

      <Card title="Diğer yapay zekâ ve analiz bileşenleri">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {inv.components.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-semibold text-foreground text-sm">{c.name}</p>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{c.kind}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono">{c.model}</span> · {c.runs}
                {c.loaded !== undefined && ` · ${c.loaded ? "bellekte yüklü" : "henüz yüklenmedi"}`}
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-foreground/90 space-y-0.5">
                {c.used_for.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.app_metadata?.role === "admin";
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<Tab>("usage");

  useEffect(() => {
    if (isAdmin) adminService.overview().then(setOverview).catch(() => setOverview(null));
  }, [isAdmin]);

  if (user && !isAdmin) {
    return (
      <div role="alert" className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
        Bu sayfa yalnızca platform yöneticileri içindir.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-16 space-y-6">
      <div>
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Admin paneli</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform geneli sayılar, yapay zekâ kullanımı ve kullanılan yapay zekâ bileşenleri.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile label="Kullanıcı" value={fmt(overview?.users)} />
        <StatTile label="Kurum" value={fmt(overview?.organizations)} />
        <StatTile label="Mülakat" value={fmt(overview?.interviews_total)}>
          <span className="text-xs text-muted-foreground">{fmt(overview?.interviews_completed)} tamamlandı · bu ay {fmt(overview?.interviews_month)}</span>
        </StatTile>
        <StatTile label="CV" value={fmt(overview?.cvs)} />
        <StatTile label="İlan" value={fmt(overview?.job_postings)} />
      </div>

      <div className="flex gap-2 border-b border-border" role="tablist" aria-label="Admin bölümleri">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-2 ${
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {id === "usage" ? <Cpu className="w-4 h-4" /> : <Boxes className="w-4 h-4" />} {label}
          </button>
        ))}
      </div>

      {tab === "usage" ? <UsageTab /> : <InventoryTab />}
    </div>
  );
}
