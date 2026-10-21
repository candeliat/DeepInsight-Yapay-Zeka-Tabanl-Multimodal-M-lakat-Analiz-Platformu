"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, XCircle, Play, CalendarClock, AlertTriangle, ArrowRight, Building2 } from "lucide-react";
import { assignmentService, MyAssignment } from "@/services/assignmentService";
import { StatusBadge, formatDue } from "@/components/org/AssignmentsPanel";
import { Button } from "@/components/ui/Button";
import { MyOrganization, orgService } from "@/services/orgService";

export default function AssignmentsPage() {
  const [items, setItems] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Yönettiği kurumlar: personelin ödevleri burada değil kurum panelinde.
  const [staffOrgs, setStaffOrgs] = useState<MyOrganization[]>([]);

  useEffect(() => {
    orgService
      .myOrganizations()
      .then((orgs) => setStaffOrgs(orgs.filter((o) => o.role !== "candidate")))
      .catch(() => {}); // yalnızca yönlendirme ipucu; başarısızlık sayfayı bozmaz
    assignmentService
      .mine()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Ödevler yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  const todo = items.filter((a) => a.status !== "completed");
  const done = items.filter((a) => a.status === "completed");

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <ClipboardList className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Ödevlerim</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kurumlarınızın eğitmenlerinin size atadığı mülakat ödevleri. Skorunuzu siz her zaman görürsünüz; eğitmen yalnızca paylaşım izni verdiyseniz görür.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">Size atanmış bir ödev yok.</p>
          {staffOrgs.length > 0 ? (
            <div className="mt-3 flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">Atadığınız ödevleri kurum panelinde yönetirsiniz:</p>
              {staffOrgs.map((o) => (
                <Link key={o.id} href={`/organizations/${o.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  <Building2 className="w-4 h-4" /> {o.name} <ArrowRight className="w-4 h-4" />
                </Link>
              ))}
            </div>
          ) : (
            <Link href="/organizations" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Bir kuruma davet koduyla katılın <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <Section title={`Yapılacaklar (${todo.length})`} items={todo} empty="Tüm ödevleri tamamladınız." />
          {done.length > 0 && <Section title={`Tamamlananlar (${done.length})`} items={done} />}
        </div>
      )}
    </div>
  );
}

function Section({ title, items, empty }: { title: string; items: MyAssignment[]; empty?: string }) {
  return (
    <section>
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 ml-1">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground ml-1">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <AssignmentCard key={a.id} a={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AssignmentCard({ a }: { a: MyAssignment }) {
  const due = formatDue(a.due_at);
  const startHref = `/chat/text?assignment=${a.id}`;
  return (
    <li className="bg-card border border-border rounded-3xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-semibold text-foreground">{a.title}</p>
            <StatusBadge status={a.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {a.role} · {a.topic}
            {a.difficulty && ` · ${a.difficulty}`}
          </p>
          <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-muted-foreground">
            {a.org_name && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> {a.org_name}
              </span>
            )}
            {due && (
              <span className={`inline-flex items-center gap-1 ${a.overdue ? "text-destructive font-semibold" : ""}`}>
                {a.overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
                {a.overdue ? "Süresi geçti: " : "Son tarih: "}
                {due}
              </span>
            )}
          </div>
          {a.instructions && <p className="text-sm text-foreground mt-3 whitespace-pre-wrap">{a.instructions}</p>}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {a.status === "completed" && a.my_score != null && (
            <p className="text-right">
              <span className="font-serif text-3xl text-foreground tabular-nums">{Math.round(a.my_score)}</span>
              <span className="text-xs text-muted-foreground">/100</span>
            </p>
          )}
          {a.status === "completed" ? (
            <div className="flex gap-2">
              {a.interview_id && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/interviews/${a.interview_id}`}>Sonuç</Link>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={startHref}>Tekrar dene</Link>
              </Button>
            </div>
          ) : (
            <Button size="sm" asChild>
              <Link href={startHref}>
                <Play className="w-3.5 h-3.5 fill-current" /> {a.status === "in_progress" ? "Yeniden başla" : "Başla"}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
