"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Database, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { orgService } from "@/services/orgService";
import type { QuestionBankItem } from "@/services/questionBankService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

const DIFFICULTIES = ["JUNIOR", "ORTA", "UZMAN"];

/**
 * Kuruma özel soru bankası. Sorular yalnızca bu kurum bağlamında başlatılan mülakatlarda,
 * platformun global sorularıyla birlikte havuza girer; diğer kurumlar göremez.
 */
export function QuestionsPanel({ orgId, onError }: { orgId: string; onError: (message: string) => void }) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fail = useCallback((err: unknown, fallback: string) => onError(err instanceof Error ? err.message : fallback), [onError]);

  useEffect(() => {
    let cancelled = false;
    orgService
      .questions(orgId)
      .then((qs) => { if (!cancelled) setQuestions(qs); })
      .catch((err) => { if (!cancelled) fail(err, "Kurum soruları yüklenemedi."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, fail]);

  const canSubmit = role.trim().length >= 2 && topic.trim().length >= 2 && text.trim().length >= 10;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const created = await orgService.createQuestion(orgId, {
        role: role.trim(),
        topic: topic.trim(),
        difficulty: difficulty || undefined,
        question_text: text.trim(),
      });
      setQuestions((qs) => [created, ...qs]);
      setText("");
    } catch (err) {
      fail(err, "Soru eklenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const update = async (id: string, payload: { question_text?: string; is_active?: boolean }) => {
    setBusyId(id);
    try {
      const updated = await orgService.updateQuestion(orgId, id, payload);
      setQuestions((qs) => qs.map((q) => (q.id === id ? updated : q)));
      setEditingId(null);
    } catch (err) {
      fail(err, "Soru güncellenemedi.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await orgService.deleteQuestion(orgId, id);
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      fail(err, "Soru silinemedi.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
      <h2 className="font-bold text-foreground text-sm flex items-center gap-2 mb-1">
        <Database className="w-4 h-4 text-primary" /> Kurum soru bankası ({questions.length})
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Buraya eklenen sorular yalnızca bu kurum adına başlatılan mülakatlarda, platformun genel sorularıyla birlikte sorulur.
        Rol ve konu, öğrencinin mülakatta seçtiği alanlarla eşleşmeli (örn. &quot;Backend Geliştirici&quot; / &quot;Python&quot;).
      </p>

      <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rol" maxLength={80} aria-label="Sorunun rolü" />
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Konu" maxLength={120} aria-label="Sorunun konusu" />
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          aria-label="Sorunun zorluğu"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">Tüm zorluklar</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Soru metni (en az 10 karakter)"
          maxLength={2000}
          rows={2}
          aria-label="Soru metni"
          className="sm:col-span-3"
        />
        <div className="sm:col-span-3 flex justify-end">
          <Button type="submit" size="sm" disabled={saving || !canSubmit}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Soru ekle
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Yükleniyor...</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz kuruma özel soru yok; mülakatlarda yalnızca platform soruları kullanılır.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {questions.map((q) => (
            <li key={q.id} className={`py-3 text-sm ${q.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
                <span className="font-semibold text-foreground">{q.role}</span>
                <span>· {q.topic}</span>
                <span>· {q.difficulty ?? "Tüm zorluklar"}</span>
                <span>· {q.times_served} kez soruldu</span>
                {!q.is_active && <span className="font-semibold text-warning">· Pasif</span>}
              </div>
              {editingId === q.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={2000} aria-label="Soru metnini düzenle" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /> Vazgeç</Button>
                    <Button
                      size="sm"
                      disabled={busyId === q.id || editText.trim().length < 10}
                      onClick={() => update(q.id, { question_text: editText.trim() })}
                    >
                      {busyId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Kaydet
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-foreground min-w-0 break-words">{q.question_text}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDelete === q.id ? (
                      <span className="text-xs">
                        <button onClick={() => handleDelete(q.id)} disabled={busyId === q.id} className="font-bold text-destructive hover:underline">Sil</button>
                        <button onClick={() => setConfirmDelete(null)} className="ml-2 text-muted-foreground hover:underline">Vazgeç</button>
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => update(q.id, { is_active: !q.is_active })}
                          disabled={busyId === q.id}
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted"
                        >
                          {q.is_active ? "Pasifleştir" : "Etkinleştir"}
                        </button>
                        <button
                          onClick={() => { setEditingId(q.id); setEditText(q.question_text); }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                          aria-label="Soruyu düzenle"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(q.id)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
                          aria-label="Soruyu sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
