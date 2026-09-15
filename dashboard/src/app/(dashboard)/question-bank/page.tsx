"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X, AlertTriangle, Layers, Loader2, Database } from "lucide-react";
import {
  questionBankService,
  QuestionBankItem,
  QuestionBankGapItem,
} from "@/services/questionBankService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

const DIFFICULTIES = ["JUNIOR", "ORTA", "UZMAN"];
const DIFFICULTY_RANK: Record<string, number> = { JUNIOR: 0, ORTA: 1, UZMAN: 2 };
const DIFFICULTY_TONE: Record<string, string> = {
  JUNIOR: "text-success bg-success/10",
  ORTA: "text-warning bg-warning/10",
  UZMAN: "text-destructive bg-destructive/10",
};

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [gaps, setGaps] = useState<QuestionBankGapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Yeni soru formu
  const [role, setRole] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [familyChoice, setFamilyChoice] = useState(""); // "" = bağımsız, "new" = yeni aile, aksi halde bir family_id
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Satır içi düzenleme
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, g] = await Promise.all([questionBankService.listQuestions(), questionBankService.listGaps()]);
      setQuestions(q);
      setGaps(g);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const families = new Map<string, QuestionBankItem[]>();
  const standalone: QuestionBankItem[] = [];
  for (const q of questions) {
    if (q.family_id) {
      const arr = families.get(q.family_id) ?? [];
      arr.push(q);
      families.set(q.family_id, arr);
    } else {
      standalone.push(q);
    }
  }
  for (const arr of families.values()) {
    arr.sort((a, b) => (DIFFICULTY_RANK[a.difficulty ?? ""] ?? 0) - (DIFFICULTY_RANK[b.difficulty ?? ""] ?? 0));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!role.trim() || !topic.trim() || questionText.trim().length < 10) {
      setFormError("Rol, konu ve en az 10 karakterlik bir soru metni girin.");
      return;
    }
    setSubmitting(true);
    try {
      await questionBankService.createQuestion({
        role: role.trim(),
        topic: topic.trim(),
        difficulty: difficulty || undefined,
        question_text: questionText.trim(),
        family_id: familyChoice && familyChoice !== "new" ? familyChoice : undefined,
        new_family: familyChoice === "new",
      });
      setQuestionText("");
      // rol/konu/zorluk/aile seçimi BİLEREK korunuyor — aynı aileye ya da aynı
      // rol/konuya art arda birkaç soru eklemek en yaygın kullanım deseni.
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Soru eklenemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (q: QuestionBankItem) => {
    try {
      await questionBankService.updateQuestion(q.id, { is_active: !q.is_active });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Güncellenemedi.");
    }
  };

  const handleDelete = async (q: QuestionBankItem) => {
    if (!confirm("Bu soruyu kalıcı olarak silmek istediğinize emin misiniz?")) return;
    try {
      await questionBankService.deleteQuestion(q.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Silinemedi.");
    }
  };

  const startEdit = (q: QuestionBankItem) => {
    setEditingId(q.id);
    setEditText(q.question_text);
  };

  const saveEdit = async (q: QuestionBankItem) => {
    if (editText.trim().length < 10) return;
    setSavingEdit(true);
    try {
      await questionBankService.updateQuestion(q.id, { question_text: editText.trim() });
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Güncellenemedi.");
    } finally {
      setSavingEdit(false);
    }
  };

  const renderRow = (q: QuestionBankItem, chained: boolean) => {
    const isEditing = editingId === q.id;
    return (
      <div
        key={q.id}
        className={`flex items-start gap-3 py-2.5 ${chained ? "border-l-2 border-primary/20 pl-4" : ""} ${!q.is_active ? "opacity-50" : ""}`}
      >
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="text-sm min-h-[70px]" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveEdit(q)} disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Kaydet
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                  <X className="w-3.5 h-3.5" /> Vazgeç
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground leading-relaxed">{q.question_text}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {q.difficulty && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_TONE[q.difficulty] ?? "text-muted-foreground bg-muted"}`}>
                    {q.difficulty}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground font-medium">{q.times_served}x soruldu</span>
                {!q.is_active && <span className="text-[10px] text-muted-foreground font-bold">(pasif)</span>}
              </div>
            </>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => startEdit(q)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Düzenle">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleToggleActive(q)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              title={q.is_active ? "Pasifleştir" : "Aktifleştir"}
            >
              {q.is_active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => handleDelete(q)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors" title="Sil">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Database className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Soru Bankası</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mülakat sorularını buradan ekleyin ve düzenleyin — embedding otomatik hesaplanır, SQL Editor&apos;e gerek kalmaz.
        </p>
      </div>

      {/* Yeni Soru Formu */}
      <div className="bg-card border border-border rounded-3xl shadow-sm p-6 mb-8">
        <h2 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Yeni Soru Ekle
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Rol</label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Örn: Backend Developer" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Konu</label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Örn: Python" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Zorluk (opsiyonel)</label>
              <div className="flex gap-1.5">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(difficulty === level ? "" : level)}
                    className={`flex-1 h-10 rounded-xl border-2 font-bold text-[11px] tracking-wide transition-all cursor-pointer ${
                      difficulty === level ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Soru Metni</label>
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Mülakat sorusunu buraya yazın..."
              className="min-h-[90px] text-[15px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Aile (opsiyonel)</label>
            <select
              value={familyChoice}
              onChange={(e) => setFamilyChoice(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Bağımsız soru</option>
              <option value="new">+ Yeni aile oluştur</option>
              {[...families.entries()].map(([fid, members]) => (
                <option key={fid} value={fid}>
                  {members[0].question_text.slice(0, 50)}… ({members.length} varyant)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground ml-1">
              Aynı konuyu farklı zorluklarda ele alan sorular bir &quot;aile&quot; oluşturur — mülakat sırasında zorluk kademeli olarak artar.
            </p>
          </div>

          {formError && <p className="text-xs text-destructive font-semibold">{formError}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Ekleniyor...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Soruyu Ekle
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Boşluklar */}
      {gaps.length > 0 && (
        <div className="bg-warning/5 border border-warning/20 rounded-2xl p-5 mb-8">
          <h2 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> Boşluklar — bunlar için yeterli soru yok
          </h2>
          <div className="space-y-2">
            {gaps.slice(0, 8).map((g) => (
              <div key={g.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium">
                  {g.role} · {g.topic}
                  {g.difficulty ? ` · ${g.difficulty}` : ""}
                </span>
                <span className="text-muted-foreground shrink-0 ml-3">{g.miss_count} kez görüldü</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Soru Listesi */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-destructive font-semibold">{loadError}</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">Henüz soru eklenmemiş.</p>
      ) : (
        <div className="space-y-6">
          {[...families.entries()].map(([fid, members]) => (
            <div key={fid} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Aile · {members[0].role} / {members[0].topic}
                </span>
              </div>
              <div className="divide-y divide-border/60">{members.map((q) => renderRow(q, true))}</div>
            </div>
          ))}

          {standalone.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bağımsız Sorular</span>
              </div>
              <div className="divide-y divide-border/60">{standalone.map((q) => renderRow(q, false))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
