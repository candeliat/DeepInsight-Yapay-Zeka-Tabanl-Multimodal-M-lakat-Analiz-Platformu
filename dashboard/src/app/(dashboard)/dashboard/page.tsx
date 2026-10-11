"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Briefcase, CalendarClock, CheckCircle2, ClipboardList, FileText, Loader2, MessageCircle, Play,
  TrendingDown, TrendingUp, UserPen, Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";
import { chatService } from "@/services/chatService";
import { progressService, Progress } from "@/services/progressService";
import { assignmentService, MyAssignment } from "@/services/assignmentService";
import { cvService } from "@/services/cvService";
import { BAND_BADGE, scoreBand } from "@/lib/scoreBand";

interface InterviewRow {
  id: string;
  role: string;
  topic: string;
  status: string;
  created_at: string;
  average_score: number | null;
}

const QUICK = [
  { href: "/chat/text", label: "Yazılı mülakat", sub: "Kamera gerekmez", icon: MessageCircle },
  { href: "/chat", label: "Görüntülü mülakat", sub: "Göz teması ve konuşma analizi", icon: Video },
  { href: "/cv", label: "CV analizi", sub: "ATS uyumu ve CV'ye özel sorular", icon: FileText },
  { href: "/jobs", label: "İlan eşleştir", sub: "Uyum skoru ve yol haritası", icon: Briefcase },
];

export default function DashboardOverview() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [hasCv, setHasCv] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    // Her parça bağımsız yüklenir; biri başarısız olursa diğerleri yine görünür.
    Promise.allSettled([
      chatService.getMyInterviews().then(setInterviews),
      progressService.getMyProgress().then(setProgress),
      assignmentService.mine().then(setAssignments),
      cvService.listCvs().then((cvs) => setHasCv(cvs.length > 0)),
    ]).finally(() => setLoading(false));
  }, [user?.id]);

  const firstName = user?.user_metadata?.first_name;
  const target = user?.user_metadata?.target;
  const ongoing = interviews.find((i) => i.status !== "completed");
  const pending = assignments.filter((a) => a.status !== "completed");
  const completedCount = progress?.completed_count ?? interviews.filter((i) => i.status === "completed").length;
  const recent = progress?.trend?.average;
  const topRec = progress?.recommendations.find((r) => r.action) ?? progress?.recommendations[0];
  const isNew = !loading && completedCount === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="font-serif italic text-3xl text-foreground">{firstName ? `Merhaba, ${firstName}` : "Merhaba"}</h1>
        <p className="text-muted-foreground mt-2 text-base">
          {target ? `${target} hedefin için bugün ne çalışmak istersin?` : "Mülakatlara hazırlanmak için bir başlangıç noktası seç."}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {ongoing && (
            <div className="flex items-center justify-between gap-4 flex-wrap bg-warning/10 border border-warning/30 rounded-3xl px-6 py-4">
              <div className="text-sm">
                <p className="font-semibold text-foreground">Yarıda kalan bir mülakatın var</p>
                <p className="text-muted-foreground">{ongoing.role} · {ongoing.topic} · {new Date(ongoing.created_at).toLocaleDateString("tr-TR")}</p>
              </div>
              <Button size="sm" asChild>
                <Link href={`/chat/text?resume=${ongoing.id}`}><Play className="w-4 h-4" /> Kaldığın yerden devam et</Link>
              </Button>
            </div>
          )}

          {isNew && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-foreground">İlk adımlar</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  {[
                    { done: !!target, label: "Profiline hedef pozisyonunu ekle", href: "/profile", icon: UserPen },
                    { done: !!hasCv, label: "CV'ni yükle ve ATS uyumunu gör (opsiyonel)", href: "/cv", icon: FileText },
                    { done: false, label: "İlk mülakatını yap", href: "/chat/text", icon: MessageCircle },
                  ].map((step, i) => (
                    <li key={step.href}>
                      <Link href={step.href} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted transition-colors">
                        {step.done ? (
                          <CheckCircle2 className="w-5 h-5 text-success shrink-0" aria-label="Tamamlandı" />
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-border text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        )}
                        <step.icon className="w-4 h-4 text-muted-foreground" />
                        <span className={step.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}>{step.label}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {QUICK.map((q) => (
              <Link key={q.href} href={q.href} className="group bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <q.icon className="w-5 h-5" />
                </div>
                <p className="font-semibold text-foreground text-sm">{q.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.sub}</p>
              </Link>
            ))}
          </div>

          {pending.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" /> Bekleyen ödevler ({pending.length})
                </CardTitle>
                <Link href="/assignments" className="text-sm font-semibold text-primary hover:underline">Tümü</Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {pending.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm py-1">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{a.title}</p>
                      <p className={`text-xs inline-flex items-center gap-1 ${a.overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        <CalendarClock className="w-3.5 h-3.5" />
                        {a.due_at ? `${a.overdue ? "Süresi geçti: " : "Son tarih: "}${new Date(a.due_at).toLocaleDateString("tr-TR")}` : a.org_name}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/chat/text?assignment=${a.id}`}>Başla</Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {completedCount > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tamamlanan mülakat</p>
                  <p className="font-serif text-3xl text-foreground mt-1">{completedCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Son 5 mülakat ortalaması</p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <p className="font-serif text-3xl text-foreground">{recent?.recent != null ? Math.round(recent.recent) : "—"}</p>
                    {recent?.delta != null && (
                      <span className={`text-sm font-semibold inline-flex items-center gap-1 ${recent.delta >= 0 ? "text-success" : "text-destructive"}`}>
                        {recent.delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {recent.delta > 0 ? "+" : ""}{Math.round(recent.delta)} puan
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Önerimiz</p>
                  {topRec ? (
                    <>
                      <p className="text-sm font-semibold text-foreground mt-1">{topRec.title}</p>
                      {topRec.action ? (
                        <Link
                          href={`/chat/text?${new URLSearchParams(
                            Object.entries(topRec.action).filter(([, v]) => v) as [string, string][],
                          )}`}
                          className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 mt-2"
                        >
                          Pratik yap <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <Link href="/progress" className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 mt-2">
                          Gelişimim <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">Harika gidiyorsun; yeni bir konu dene.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {interviews.length > 0 && (
            <Card>
              <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg font-bold text-foreground">Son mülakatlar</CardTitle>
                <Link href="/interviews" className="text-sm font-semibold text-primary hover:underline">Tümü</Link>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted border-b border-border">
                      <tr>
                        <th scope="col" className="px-6 py-3 font-semibold tracking-wider">Pozisyon · konu</th>
                        <th scope="col" className="px-6 py-3 font-semibold tracking-wider">Tarih</th>
                        <th scope="col" className="px-6 py-3 font-semibold tracking-wider">Skor</th>
                        <th scope="col" className="px-6 py-3 font-semibold tracking-wider">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interviews.slice(0, 5).map((iv) => {
                        const done = iv.status === "completed";
                        const band = done ? scoreBand(iv.average_score) : null;
                        const href = done ? `/interviews/${iv.id}` : `/chat/text?resume=${iv.id}`;
                        return (
                          <tr key={iv.id} onClick={() => router.push(href)} className="bg-card hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-0">
                            <td className="px-6 py-3">
                              <Link href={href} className="font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>{iv.role}</Link>
                              <p className="text-xs text-muted-foreground">{iv.topic}</p>
                            </td>
                            <td className="px-6 py-3 text-muted-foreground">{new Date(iv.created_at).toLocaleDateString("tr-TR")}</td>
                            <td className="px-6 py-3 font-semibold text-foreground">{done && iv.average_score != null ? Math.round(iv.average_score) : "—"}</td>
                            <td className="px-6 py-3">
                              {band ? <Badge variant={BAND_BADGE[band.tone]}>{band.label}</Badge> : <Badge variant="default">Yarıda kaldı</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
