"use client";

import React, { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Download, Loader2, XCircle, Info, TrendingUp, TrendingDown } from "lucide-react";
import { pilotService, PairedStats, PilotReport } from "@/services/pilotService";
import { StatTile } from "@/components/progress/ProgressView";
import { Button } from "@/components/ui/Button";

const UP = "#2a78d6";
const DOWN = "#eb6834";
const AXIS = "#898781";
const GRID = "#e1e0d9";

function fmt(v: number | null | undefined, digits = 1) {
  return v == null ? "—" : v.toFixed(digits).replace(".", ",");
}

function fmtP(p: number | null) {
  if (p == null) return "—";
  return p < 0.001 ? "< 0,001" : p.toFixed(3).replace(".", ",");
}

function StatsTable({ title, s }: { title: string; s: PairedStats }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-4">
      <p className="text-xs font-bold text-foreground mb-2">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Katılımcı (n)</dt><dd className="text-right tabular-nums">{s.n}</dd>
        <dt className="text-muted-foreground">Önce → sonra ort.</dt><dd className="text-right tabular-nums">{fmt(s.mean_pre)} → {fmt(s.mean_post)}</dd>
        <dt className="text-muted-foreground">Ortalama fark</dt><dd className="text-right tabular-nums font-semibold">{s.mean_delta != null && s.mean_delta > 0 ? "+" : ""}{fmt(s.mean_delta)}</dd>
        <dt className="text-muted-foreground">Gelişen / gerileyen</dt><dd className="text-right tabular-nums">{s.improved} / {s.declined}</dd>
        <dt className="text-muted-foreground">Eşleştirilmiş t-testi p</dt><dd className="text-right tabular-nums">{fmtP(s.p_ttest)}{s.t != null && ` (t=${fmt(s.t, 2)})`}</dd>
        <dt className="text-muted-foreground">Wilcoxon p</dt><dd className="text-right tabular-nums">{fmtP(s.p_wilcoxon)}</dd>
        <dt className="text-muted-foreground">Etki büyüklüğü (dz)</dt><dd className="text-right tabular-nums">{fmt(s.cohens_dz, 2)}</dd>
      </dl>
    </div>
  );
}

export default function PilotReportPage() {
  const [report, setReport] = useState<PilotReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    pilotService
      .report()
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "Rapor yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  const handleCsv = async () => {
    try {
      await pilotService.downloadReportCsv();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İndirilemedi.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const deltas = (report?.rows ?? []).filter((r) => r.delta != null).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const fl = report?.first_last;

  return (
    <div className="max-w-6xl mx-auto pb-16 space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <BarChart3 className="w-7 h-7" />
          </div>
          <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Pilot Raporu</h1>
          <p className="text-sm text-muted-foreground mt-1">Yalnızca araştırma onamı veren katılımcılar · kimliksiz (P01, P02…)</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCsv} disabled={!report?.participants}>
          <Download className="w-3.5 h-3.5" /> CSV indir
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Katılımcı" value={String(report.participants)}>
              <span className="text-xs text-muted-foreground">{report.with_pre_post} kişide önce/sonra verisi</span>
            </StatTile>
            <StatTile label="İlk → son mülakat" value={fl?.mean_pre != null ? `${fmt(fl.mean_pre, 0)} → ${fmt(fl.mean_post, 0)}` : "—"}>
              <span className="text-xs text-muted-foreground">ortalama skor (0-100)</span>
            </StatTile>
            <StatTile label="Ortalama gelişim" value={fl?.mean_delta != null ? `${fl.mean_delta > 0 ? "+" : ""}${fmt(fl.mean_delta)}` : "—"}>
              <span className="text-xs text-muted-foreground">p = {fmtP(fl?.p_ttest ?? null)} (t-testi)</span>
            </StatTile>
            <StatTile label="Kullanılabilirlik (SUS)" value={report.sus.mean != null ? fmt(report.sus.mean, 0) : "—"}>
              <span className="text-xs text-muted-foreground">{report.sus.grade ?? `${report.sus.n} yanıt`}</span>
            </StatTile>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-3xl shadow-sm p-6">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h2 className="font-bold text-foreground text-sm">Katılımcı başına değişim (son − ilk mülakat)</h2>
                <button onClick={() => setShowTable((v) => !v)} className="text-xs font-semibold text-primary hover:underline">
                  {showTable ? "Grafik" : "Tablo"}
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: UP }} /> <TrendingUp className="w-3.5 h-3.5" aria-hidden /> Gelişti</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: DOWN }} /> <TrendingDown className="w-3.5 h-3.5" aria-hidden /> Geriledi</span>
              </div>
              {deltas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz en az 2 mülakatı olan katılımcı yok.</p>
              ) : showTable ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3 font-semibold">Katılımcı</th>
                        <th className="py-2 pr-3 font-semibold text-right">Mülakat</th>
                        <th className="py-2 pr-3 font-semibold text-right">İlk</th>
                        <th className="py-2 pr-3 font-semibold text-right">Son</th>
                        <th className="py-2 pr-3 font-semibold text-right">Fark</th>
                        <th className="py-2 pr-3 font-semibold text-right">İlk 2 → Son 2</th>
                        <th className="py-2 font-semibold text-right">SUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={r.participant} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-semibold">{r.participant}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{r.interviews}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.first)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.last)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-semibold">{r.delta != null && r.delta > 0 ? "+" : ""}{fmt(r.delta)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{r.first2 != null ? `${fmt(r.first2)} → ${fmt(r.last2)}` : "—"}</td>
                          <td className="py-2 text-right tabular-nums">{fmt(r.sus, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ height: Math.max(160, deltas.length * 34) }} role="img" aria-label="Katılımcı başına son ve ilk mülakat skoru farkı">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deltas} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                      <CartesianGrid horizontal={false} stroke={GRID} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis type="category" dataKey="participant" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={40} />
                      <ReferenceLine x={0} stroke={AXIS} />
                      <Tooltip
                        cursor={{ fill: "rgba(11,11,11,0.04)" }}
                        contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 }}
                        itemStyle={{ color: "#0b0b0b" }}
                        formatter={(value, _n, item) => {
                          const r = item?.payload as { first: number; last: number } | undefined;
                          const v = Number(value);
                          return [`${v > 0 ? "+" : ""}${fmt(v)} (${fmt(r?.first)} → ${fmt(r?.last)})`, "Değişim"];
                        }}
                      />
                      <Bar
                        dataKey="delta"
                        radius={4}
                        maxBarSize={22}
                        isAnimationActive={false}
                        label={{ position: "right", fontSize: 11, fill: "#52514c", formatter: (v: unknown) => `${Number(v) > 0 ? "+" : ""}${fmt(Number(v))}` }}
                      >
                        {deltas.map((r) => (
                          <Cell key={r.participant} fill={(r.delta ?? 0) >= 0 ? UP : DOWN} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {fl && <StatsTable title="İlk ve son mülakat" s={fl} />}
              {report.first2_last2.n > 0 && <StatsTable title="İlk 2 ve son 2 mülakat ortalaması (≥4 mülakat)" s={report.first2_last2} />}
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-xs font-bold text-foreground mb-2">Mülakat sonrası anket ({report.post_interview.n} yanıt, 1-5)</p>
                <ul className="space-y-1.5 text-xs">
                  {report.post_interview.items.map((i) => (
                    <li key={i.key} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{i.label}</span>
                      <span className="tabular-nums font-semibold shrink-0">{fmt(i.mean)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-card border border-border rounded-3xl p-5 text-xs text-muted-foreground leading-relaxed">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
            <p>
              Yorumlarken: Bu bir tek gruplu önce/sonra tasarımıdır; kontrol grubu olmadığından gelişimin tamamı platforma
              atfedilemez (pratik etkisi, konu/zorluk farkı ve LLM puanlama değişkenliği de rol oynar). Küçük örneklemde
              (n &lt; 20) Wilcoxon sonucu t-testinden daha güvenilirdir; p değerinin yanında etki büyüklüğünü (dz; 0,2 küçük,
              0,5 orta, 0,8 büyük) raporlayın.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
