"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Building2,
  Loader2,
  XCircle,
  Lock,
  ArrowRight,
  Copy,
  RefreshCw,
  Users,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Trash2,
} from "lucide-react";
import { orgService, MemberDetail, MyOrganization, OrgOverview, OrganizationDetail, OrgRole, ROLE_LABEL } from "@/services/orgService";
import { useAuthStore } from "@/store/useAuthStore";
import { StatTile } from "@/components/progress/ProgressView";
import { AssignmentsPanel } from "@/components/org/AssignmentsPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const BAR = "#2a78d6";
const AXIS = "#898781";
const GRID = "#e1e0d9";

function weekLabel(week: string) {
  const n = week.split("-W")[1];
  return n ? `${Number(n)}. hf` : week;
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "—";
}

export default function OrganizationPanelPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const { user } = useAuthStore();

  const [myRole, setMyRole] = useState<OrgRole | null>(null);
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsQuota, setSettingsQuota] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const isAdmin = myRole === "org_admin" || user?.app_metadata?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mine: MyOrganization[] = await orgService.myOrganizations();
      const role = mine.find((o) => o.id === orgId)?.role ?? null;
      setMyRole(role);
      const [ov, mem] = await Promise.all([orgService.overview(orgId), orgService.members(orgId)]);
      setOverview(ov);
      setMembers(mem);
      setSettingsName(ov.org.name);
      setSettingsQuota(ov.org.monthly_interview_quota ? String(ov.org.monthly_interview_quota) : "");
      if (role === "org_admin" || user?.app_metadata?.role === "admin") {
        setDetail(await orgService.get(orgId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [orgId, user?.app_metadata?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    }
  };

  const handleRoleChange = (m: MemberDetail, role: OrgRole) =>
    run(async () => {
      await orgService.updateMemberRole(orgId, m.user_id, role);
      setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, role } : x)));
    }, "Rol değiştirilemedi.");

  const handleRemove = (m: MemberDetail) =>
    run(async () => {
      await orgService.removeMember(orgId, m.user_id);
      setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id));
      setConfirmRemove(null);
    }, "Üye çıkarılamadı.");

  const handleRotate = () =>
    run(async () => {
      const { invite_code } = await orgService.rotateInviteCode(orgId);
      setDetail((d) => (d ? { ...d, invite_code } : d));
      setConfirmRotate(false);
      setNotice("Yeni davet kodu oluşturuldu; eski kod artık geçersiz.");
    }, "Kod yenilenemedi.");

  const handleCopy = () =>
    run(async () => {
      if (!detail) return;
      await navigator.clipboard.writeText(detail.invite_code);
      setNotice("Davet kodu kopyalandı.");
    }, "Kopyalanamadı.");

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    await run(async () => {
      const quota = settingsQuota.trim() ? Number(settingsQuota) : undefined;
      const updated = await orgService.updateSettings(orgId, {
        name: settingsName.trim() || undefined,
        monthly_interview_quota: quota,
        clear_quota: !settingsQuota.trim(),
      });
      setDetail(updated);
      setOverview((o) => (o ? { ...o, org: { ...o.org, name: updated.name, monthly_interview_quota: updated.monthly_interview_quota } } : o));
      setNotice("Ayarlar kaydedildi.");
    }, "Ayarlar kaydedilemedi.");
    setSavingSettings(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="max-w-3xl mx-auto">
        <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          {error ?? "Bu kurum paneline erişiminiz yok."}
        </div>
      </div>
    );
  }

  const students = overview.member_counts.candidate ?? 0;
  const quota = overview.org.monthly_interview_quota;

  return (
    <div className="max-w-6xl mx-auto pb-16 space-y-6">
      <div>
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Building2 className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-serif italic text-3xl text-foreground tracking-tight">{overview.org.name}</h1>
          {myRole && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{ROLE_LABEL[myRole]}</span>}
        </div>
        <p className="text-sm text-muted-foreground mt-1">Yalnızca kurum adına yapılan mülakatlar sayılır; öğrencinin bireysel mülakatları burada görünmez.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-3 bg-success/10 border border-success/20 text-success rounded-2xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Öğrenci" value={String(students)} />
        <StatTile label="Son 30 günde aktif öğrenci" value={String(overview.active_students_30d)} />
        <StatTile label="Bu ay mülakat" value={quota ? `${overview.month_interviews}/${quota}` : String(overview.month_interviews)}>
          <span className="text-xs text-muted-foreground">{quota ? "aylık kota" : "kota sınırsız"}</span>
        </StatTile>
        <StatTile label="Tamamlanan mülakat" value={String(overview.completed_count)} />
      </div>

      {/* Toplu istatistikler */}
      {!overview.aggregates_available ? (
        <div className="bg-card border border-border rounded-3xl p-6 flex items-start gap-3 text-sm">
          <Lock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Toplu skor istatistikleri, en az {overview.min_cohort} farklı öğrenci kurum adına mülakat yaptığında gösterilir
            (şu an {overview.contributors}). Küçük gruplarda ortalamalar tek tek öğrencilerin skorlarını açığa çıkarabileceği için gizlenir.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
            <h2 className="font-bold text-foreground text-sm">Haftalık katılım</h2>
            <p className="text-xs text-muted-foreground mb-4">Tamamlanan mülakat sayısı · son 8 hafta</p>
            <div className="h-56" role="img" aria-label="Haftalara göre tamamlanan mülakat sayısı">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.weekly.map((w) => ({ ...w, label: weekLabel(w.week) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(11,11,11,0.04)" }}
                    contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 12 }}
                    itemStyle={{ color: "#0b0b0b" }}
                    formatter={(value, _name, item) => {
                      const avg = (item?.payload as { average: number | null } | undefined)?.average;
                      return [`${value} mülakat · ort. ${avg != null ? Math.round(avg) : "gizli (<3 öğrenci)"}`, "Bu hafta"];
                    }}
                  />
                  <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
            <h2 className="font-bold text-foreground text-sm mb-1">Kurum ortalamaları</h2>
            <p className="text-xs text-muted-foreground mb-4">{overview.contributors} öğrencinin kurum mülakatları</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {([
                ["Genel", "average"],
                ["Teknik bilgi", "technical"],
                ["Özgüven", "confidence"],
                ["İletişim ve kelime", "vocabulary"],
              ] as const).map(([label, key]) => (
                <div key={key} className="rounded-2xl bg-muted/50 px-4 py-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold text-foreground">{overview.metric_means[key]?.toFixed(0) ?? "—"}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Konular</p>
            <ul className="space-y-1.5">
              {overview.topics.slice(0, 5).map((t) => (
                <li key={t.topic} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {t.weak ? <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden /> : <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-hidden />}
                    <span className="truncate">{t.topic}</span>
                  </span>
                  <span className="text-xs shrink-0">
                    <span className="font-semibold tabular-nums">{t.average?.toFixed(0)}</span>
                    <span className={`ml-2 ${t.weak ? "text-warning" : "text-muted-foreground"}`}>{t.weak ? "Gelişmeli" : "İyi"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Üyeler */}
      <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
        <h2 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Üyeler ({members.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-semibold">Kişi</th>
                <th className="py-2 pr-3 font-semibold">Rol</th>
                <th className="py-2 pr-3 font-semibold text-right">Mülakat</th>
                <th className="py-2 pr-3 font-semibold">Son mülakat</th>
                <th className="py-2 pr-3 font-semibold text-right">Ortalama</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === user?.id;
                return (
                  <tr key={m.user_id} className="border-b border-border/60 align-middle">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-foreground">{m.name ?? m.email ?? "—"}</p>
                      {m.name && <p className="text-[11px] text-muted-foreground">{m.email}</p>}
                    </td>
                    <td className="py-2.5 pr-3">
                      {isAdmin && !isSelf ? (
                        <select
                          aria-label={`${m.name ?? m.email} rolü`}
                          value={m.role}
                          onChange={(e) => handleRoleChange(m, e.target.value as OrgRole)}
                          className="h-8 px-2 rounded-lg border border-border bg-background text-xs"
                        >
                          {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs">{ROLE_LABEL[m.role]}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{m.interview_count}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">{formatDate(m.last_interview_at)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {m.role !== "candidate" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : m.share_progress ? (
                        <span className="font-semibold tabular-nums">{m.average != null ? Math.round(m.average) : "—"}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Öğrenci ilerlemesini paylaşmıyor">
                          <Lock className="w-3 h-3" /> Paylaşılmadı
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {m.role === "candidate" && m.share_progress && m.interview_count > 0 && (
                          <Link href={`/organizations/${orgId}/members/${m.user_id}`} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                            Gelişim <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                        {isAdmin && !isSelf &&
                          (confirmRemove === m.user_id ? (
                            <span className="text-xs">
                              <button onClick={() => handleRemove(m)} className="font-bold text-destructive hover:underline">Çıkar</button>
                              <button onClick={() => setConfirmRemove(null)} className="ml-2 text-muted-foreground hover:underline">Vazgeç</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmRemove(m.user_id)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
                              aria-label={`${m.name ?? m.email} üyesini çıkar`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AssignmentsPanel orgId={orgId} onError={setError} />

      {isAdmin && detail && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
            <h2 className="font-bold text-foreground text-sm mb-1">Davet kodu</h2>
            <p className="text-xs text-muted-foreground mb-4">Öğrenciler &quot;Kurumlarım&quot; sayfasında bu kodla katılır.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-lg tracking-wider bg-muted rounded-xl px-4 py-2.5 select-all">{detail.invite_code}</code>
              <Button size="icon" variant="outline" onClick={handleCopy} aria-label="Davet kodunu kopyala">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="mt-3 text-xs">
              {confirmRotate ? (
                <span>
                  Eski kod geçersiz olacak.{" "}
                  <button onClick={handleRotate} className="font-bold text-destructive hover:underline">Yenile</button>
                  <button onClick={() => setConfirmRotate(false)} className="ml-2 text-muted-foreground hover:underline">Vazgeç</button>
                </span>
              ) : (
                <button onClick={() => setConfirmRotate(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
                  <RefreshCw className="w-3 h-3" /> Kodu yenile
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="bg-card border border-border rounded-3xl shadow-sm p-6 space-y-3">
            <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" /> Kurum ayarları
            </h2>
            <div className="space-y-1.5">
              <label htmlFor="org-name" className="text-xs font-semibold text-muted-foreground">Kurum adı</label>
              <Input id="org-name" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} minLength={2} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="org-quota" className="text-xs font-semibold text-muted-foreground">Aylık mülakat kotası</label>
              <Input
                id="org-quota"
                type="number"
                min={1}
                value={settingsQuota}
                onChange={(e) => setSettingsQuota(e.target.value)}
                placeholder="Boş bırakılırsa sınırsız"
              />
            </div>
            <Button type="submit" size="sm" disabled={savingSettings}>
              {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Kaydet
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
