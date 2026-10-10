"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Play,
  Lightbulb,
  Table2,
  LineChart as LineChartIcon,
} from "lucide-react";
import { Progress, MetricKey } from "@/services/progressService";
import { Button } from "@/components/ui/Button";

// Doğrulanmış kategorik palet (ilk 3 slot; tüm ikili kombinasyonlarda CVD-güvenli).
// Aqua'nın beyaz yüzeyde kontrastı 3:1'in altında -> lejant + tablo görünümü zorunlu (sağlandı).
const SERIES: { key: MetricKey; label: string; color: string }[] = [
  { key: "technical", label: "Teknik bilgi", color: "#2a78d6" },
  { key: "confidence", label: "Özgüven", color: "#eb6834" },
  { key: "vocabulary", label: "İletişim ve kelime", color: "#1baf7a" },
];
const LABEL: Record<MetricKey, string> = { technical: "Teknik bilgi", confidence: "Özgüven", vocabulary: "İletişim ve kelime" };
const AXIS = "#898781";
const GRID = "#e1e0d9";

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "";
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">karşılaştırma için en az 6 mülakat gerekli</span>;
  if (Math.abs(value) < 1)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="w-3.5 h-3.5" /> değişim yok
      </span>
    );
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-success" : "text-destructive"}`}>
      <Icon className="w-3.5 h-3.5" />
      {up ? "+" : ""}
      {value.toFixed(0)} önceki 5&apos;e göre
    </span>
  );
}

export function StatTile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  // Sayılar büyük, kelime değerleri (örn. "İletişim ve kelime") taşmasın diye daha küçük puntoda.
  const isNumeric = /\d/.test(value);
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={`${isNumeric ? "text-3xl" : "text-xl leading-tight"} font-semibold text-foreground mt-1`}>{value}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

function practiceHref(action: { role: string | null; topic: string | null; difficulty: string | null }) {
  const params = new URLSearchParams();
  if (action.role) params.set("role", action.role);
  if (action.topic) params.set("topic", action.topic);
  if (action.difficulty) params.set("difficulty", action.difficulty);
  return `/chat/text?${params.toString()}`;
}

/**
 * Gelişim raporunun görsel gövdesi (özet, eğilim grafiği/tablosu, konular, öneriler, video).
 * Hem öğrencinin kendi "Gelişimim" sayfası hem de eğitmenin öğrenci detayı kullanır;
 * eğitmen görünümünde "Pratik yap" düğmeleri gizlenir (allowPractice=false).
 */
export function ProgressView({ progress, allowPractice = true }: { progress: Progress; allowPractice?: boolean }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const chartData = progress.timeline.slice(-20).map((p) => ({ ...p, label: formatDate(p.date) }));

  return (
    <div className="space-y-6">
      {/* Özet kutucukları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Tamamlanan mülakat" value={String(progress.completed_count)} />
        <StatTile label="Son 5 mülakat ortalaması" value={`${progress.trend?.average.recent?.toFixed(0) ?? "—"}/100`}>
          <Delta value={progress.trend?.average.delta ?? null} />
        </StatTile>
        <StatTile label="En güçlü alan" value={progress.strongest ? LABEL[progress.strongest] : "—"}>
          {progress.strongest && (
            <span className="text-xs text-muted-foreground">ort. {progress.metric_means[progress.strongest]?.toFixed(0)}/100</span>
          )}
        </StatTile>
        <StatTile label="En çok gelişim alanı" value={progress.weakest ? LABEL[progress.weakest] : "—"}>
          {progress.weakest && (
            <span className="text-xs text-muted-foreground">ort. {progress.metric_means[progress.weakest]?.toFixed(0)}/100</span>
          )}
        </StatTile>
      </div>

      {/* Eğilim grafiği / tablo */}
      <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="font-bold text-foreground text-sm">Skor eğilimi</h2>
            <p className="text-xs text-muted-foreground">Son {chartData.length} mülakat · 0-100</p>
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5" role="tablist" aria-label="Görünüm">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "chart" ? <LineChartIcon className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
                {v === "chart" ? "Grafik" : "Tablo"}
              </button>
            ))}
          </div>
        </div>

        {view === "chart" ? (
          <div className="h-72" role="img" aria-label="Teknik bilgi, özgüven ve iletişim skorlarının zaman içindeki değişimi">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ stroke: AXIS, strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 }}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload;
                    return p ? `${p.label} · ${p.topic ?? ""}` : "";
                  }}
                  // Seri adı yazılı olsun ve metin metin renginde kalsın: kimlik yalnız renkle taşınmaz.
                  formatter={(value, name) => [`${Math.round(Number(value))}/100`, name]}
                  itemStyle={{ color: "#0b0b0b" }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12 }}
                  // Metin seri renginde değil metin renginde; kimliği yanındaki çizgi taşır.
                  formatter={(value) => <span style={{ color: "#52514e" }}>{value}</span>}
                />
                {SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: s.color }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "#ffffff" }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Tarih</th>
                  <th className="py-2 pr-3 font-semibold">Konu</th>
                  <th className="py-2 pr-3 font-semibold">Seviye</th>
                  {SERIES.map((s) => (
                    <th key={s.key} className="py-2 pr-3 font-semibold text-right">{s.label}</th>
                  ))}
                  <th className="py-2 font-semibold text-right">Ortalama</th>
                </tr>
              </thead>
              <tbody>
                {[...chartData].reverse().map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{p.label}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/interviews/${p.id}`} className="hover:underline">{p.topic}</Link>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.difficulty ?? "—"}</td>
                    {SERIES.map((s) => (
                      <td key={s.key} className="py-2 pr-3 text-right tabular-nums">
                        {p[s.key] != null ? Math.round(p[s.key] as number) : "—"}
                        {s.key === "confidence" && p.confidence_source === "video" && (
                          <span className="text-[10px] text-muted-foreground ml-1" title="Video analizinden">(video)</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 text-right font-semibold tabular-nums">{Math.round(p.average)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Konular */}
        <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
          <h2 className="font-bold text-foreground text-sm mb-4">Konu bazında performans</h2>
          <ul className="space-y-3">
            {progress.topics.slice(0, 8).map((t) => (
              <li key={t.topic}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {t.weak ? (
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-hidden />
                    )}
                    <span className="truncate text-foreground">{t.topic}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">· {t.count} mülakat</span>
                  </span>
                  <span className="text-xs shrink-0">
                    <span className="font-semibold text-foreground tabular-nums">{t.average?.toFixed(0) ?? "—"}</span>
                    <span className={`ml-2 ${t.weak ? "text-warning" : "text-muted-foreground"}`}>{t.weak ? "Gelişmeli" : "İyi"}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${t.average ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Öneriler */}
        <div className="bg-primary/5 border border-primary/20 rounded-3xl p-6">
          <h2 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" /> Öneriler
          </h2>
          {progress.recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Şu an öne çıkan bir gelişim alanı yok. Böyle devam!</p>
          ) : (
            <ul className="space-y-3">
              {progress.recommendations.map((r) => (
                <li key={r.id} className="bg-card border border-border rounded-2xl p-4">
                  <p className="text-sm font-semibold text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.detail}</p>
                  {allowPractice && r.action && (
                    <Button size="sm" variant="outline" className="mt-3" asChild>
                      <Link href={practiceHref(r.action)}>
                        <Play className="w-3.5 h-3.5 fill-current" /> Pratik yap
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {progress.video && (
        <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
          <h2 className="font-bold text-foreground text-sm mb-1">Video/ses analizi</h2>
          <p className="text-xs text-muted-foreground mb-4">{progress.video.count} kameralı mülakatın ortalaması</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Göz teması" value={progress.video.eye_contact_pct != null ? `%${progress.video.eye_contact_pct.toFixed(0)}` : "—"} />
            <StatTile label="Dolgu kelime / mülakat" value={progress.video.filler_word_count?.toFixed(0) ?? "—"} />
            <StatTile label="Konuşma hızı" value={progress.video.speech_rate_wpm != null ? `${progress.video.speech_rate_wpm.toFixed(0)} kel/dk` : "—"} />
            <StatTile label="Duraksama / mülakat" value={progress.video.pause_count?.toFixed(0) ?? "—"} />
          </div>
        </div>
      )}
    </div>
  );
}
