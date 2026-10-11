"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus, Loader2, ChevronDown, ChevronUp, Trash2, CheckCircle2, Clock, Circle, Lock, CalendarClock } from "lucide-react";
import { assignmentService, AssignmentStatus, AssignmentStudentRow, OrgAssignment, STATUS_LABEL } from "@/services/assignmentService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

const LEVELS = ["JUNIOR", "ORTA", "UZMAN"] as const;

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const Icon = status === "completed" ? CheckCircle2 : status === "in_progress" ? Clock : Circle;
  const color = status === "completed" ? "text-success" : status === "in_progress" ? "text-warning" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden /> {STATUS_LABEL[status]}
    </span>
  );
}

export function formatDue(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;
}

export function AssignmentsPanel({ orgId, onError }: { orgId: string; onError: (message: string) => void }) {
  const [items, setItems] = useState<OrgAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [students, setStudents] = useState<Record<string, AssignmentStudentRow[]>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<string>("ORTA");
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await assignmentService.list(orgId));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ödevler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [orgId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await assignmentService.create(orgId, {
        title: title.trim(),
        role: role.trim(),
        topic: topic.trim(),
        difficulty,
        instructions: instructions.trim() || undefined,
        // datetime-local yerel saattir; ISO'ya çevrilip saat dilimiyle gönderilir.
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setItems((prev) => [{ ...created, completed_count: 0, in_progress_count: 0 }, ...prev]);
      setTitle("");
      setRole("");
      setTopic("");
      setDueAt("");
      setInstructions("");
      setShowForm(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ödev oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStudents = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!students[id]) {
      try {
        const rows = await assignmentService.students(orgId, id);
        setStudents((prev) => ({ ...prev, [id]: rows }));
      } catch (e) {
        onError(e instanceof Error ? e.message : "Öğrenci durumu yüklenemedi.");
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await assignmentService.remove(orgId, id);
      setItems((prev) => prev.filter((a) => a.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ödev silinemedi.");
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" /> Ödevler ({items.length})
        </h2>
        <Button size="sm" variant={showForm ? "outline" : "primary"} onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-3.5 h-3.5" /> {showForm ? "Vazgeç" : "Yeni ödev"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ödev başlığı (örn. React haftalık pratik)" minLength={3} maxLength={120} required aria-label="Ödev başlığı" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rol (örn. Frontend Developer)" minLength={2} maxLength={80} required aria-label="Rol" />
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Konu (örn. React)" minLength={2} maxLength={120} required aria-label="Konu" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label="Zorluk">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === level}
                  onClick={() => setDifficulty(level)}
                  className={`flex-1 h-10 rounded-xl border-2 text-xs font-bold transition-colors ${
                    difficulty === level ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Son tarih (opsiyonel)" />
          </div>
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Öğrencilere not (opsiyonel)" maxLength={1000} className="min-h-[70px] text-sm" aria-label="Açıklama" />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Ödevi ata
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz ödev yok. Öğrencilere belirli bir rol ve konuda mülakat ödevi verebilirsiniz.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const pct = a.total_candidates ? (a.completed_count / a.total_candidates) * 100 : 0;
            const due = formatDue(a.due_at);
            return (
              <li key={a.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.role} · {a.topic}
                      {a.difficulty && ` · ${a.difficulty}`}
                    </p>
                    {due && (
                      <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" /> Son tarih: {due}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmDelete === a.id ? (
                      <span className="text-xs">
                        <button onClick={() => handleDelete(a.id)} className="font-bold text-destructive hover:underline">Sil</button>
                        <button onClick={() => setConfirmDelete(null)} className="ml-2 text-muted-foreground hover:underline">Vazgeç</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete(a.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" aria-label={`${a.title} ödevini sil`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground font-semibold">
                      {a.completed_count}/{a.total_candidates} öğrenci tamamladı
                    </span>
                    {a.in_progress_count > 0 && <span className="text-muted-foreground">{a.in_progress_count} devam ediyor</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <button onClick={() => toggleStudents(a.id)} className="mt-3 text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline" aria-expanded={openId === a.id}>
                  Öğrenci durumu {openId === a.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {openId === a.id && (
                  <div className="mt-3 overflow-x-auto">
                    {!students[a.id] ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {students[a.id].map((s) => (
                            <tr key={s.user_id} className="border-t border-border/60">
                              <td className="py-2 pr-3">{s.name ?? s.email ?? "—"}</td>
                              <td className="py-2 pr-3"><StatusBadge status={s.status} /></td>
                              <td className="py-2 text-right">
                                {s.status !== "completed" ? null : s.score != null ? (
                                  <span className="font-semibold tabular-nums">{Math.round(s.score)}</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3" /> Paylaşılmadı</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
