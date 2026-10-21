"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X, XCircle, AlertTriangle, Layers, Loader2, Database, Sparkles, ThumbsUp, ThumbsDown, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  questionBankService,
  QuestionBankItem,
  QuestionBankGapItem,
  QuestionBankCandidateItem,
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
// Sayfa başına aile/bağımsız soru sayısı.
const PAGE_SIZE = 15;
const SELECT_CLASS = "w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground";

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [gaps, setGaps] = useState<QuestionBankGapItem[]>([]);
  const [candidates, setCandidates] = useState<QuestionBankCandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

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

  // İşlem hataları alert() yerine sayfanın üstünde; silme onayı satır içinde (confirm() yerine).
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Liste: arama, filtre, sayfa
  const [search, setSearch] = useState("");
  const [filterTopic, setFilterTopic] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "passive">("all");
  const [page, setPage] = useState(1);
  const fail = (err: unknown, fallback: string) => setActionError(err instanceof Error ? err.message : fallback);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [q, g, c] = await Promise.all([
        questionBankService.listQuestions(),
        questionBankService.listGaps(),
        questionBankService.listCandidates(),
      ]);
      setQuestions(q);
      setGaps(g);
      setCandidates(c);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerateCandidates = async () => {
    setActionError(null);
    setGenerating(true);
    try {
      await questionBankService.generateCandidates(5);
      await load();
    } catch (e) {
      fail(e, "Öneri üretilemedi.");
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveCandidate = async (c: QuestionBankCandidateItem) => {
    setActionError(null);
    setReviewingId(c.id);
    try {
      await questionBankService.approveCandidate(c.id);
      await load();
    } catch (e) {
      fail(e, "Onaylanamadı.");
    } finally {
      setReviewingId(null);
    }
  };

  const handleRejectCandidate = async (c: QuestionBankCandidateItem) => {
    setActionError(null);
    setReviewingId(c.id);
    try {
      await questionBankService.rejectCandidate(c.id);
      await load();
    } catch (e) {
      fail(e, "Reddedilemedi.");
    } finally {
      setReviewingId(null);
    }
  };

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

  // Liste filtreleri (aile seçicisi yukarıdaki tam listeyi kullanmaya devam eder).
  const topics = [...new Set(questions.map((q) => q.topic))].sort((a, b) => a.localeCompare(b, "tr"));
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  const matches = (q: QuestionBankItem) =>
    (!needle || `${q.question_text} ${q.role} ${q.topic}`.toLocaleLowerCase("tr-TR").includes(needle)) &&
    (!filterTopic || q.topic === filterTopic) &&
    (!filterDifficulty || q.difficulty === filterDifficulty) &&
    (filterStatus === "all" || (filterStatus === "active") === q.is_active);
  // Sayfalama birimi: bir aile (yalnızca eşleşen üyeleriyle) ya da tek bir bağımsız soru.
  const entries: ({ fid: string; members: QuestionBankItem[] } | QuestionBankItem)[] = [
    ...[...families.entries()].map(([fid, members]) => ({ fid, members: members.filter(matches) })).filter((f) => f.members.length > 0),
    ...standalone.filter(matches),
  ];
  const matchedCount = entries.reduce((n, e) => n + ("members" in e ? e.members.length : 1), 0);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageFamilies = pageEntries.filter((e): e is { fid: string; members: QuestionBankItem[] } => "members" in e);
  const pageStandalone = pageEntries.filter((e): e is QuestionBankItem => !("members" in e));
  const filtering = Boolean(needle || filterTopic || filterDifficulty || filterStatus !== "all");
  const setFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

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
    setActionError(null);
    try {
      await questionBankService.updateQuestion(q.id, { is_active: !q.is_active });
      await load();
    } catch (err) {
      fail(err, "Güncellenemedi.");
    }
  };

  const handleDelete = async (q: QuestionBankItem) => {
    setActionError(null);
    try {
      await questionBankService.deleteQuestion(q.id);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      fail(err, "Silinemedi.");
    }
  };

  const startEdit = (q: QuestionBankItem) => {
    setEditingId(q.id);
    setEditText(q.question_text);
  };

  const saveEdit = async (q: QuestionBankItem) => {
    if (editText.trim().length < 10) return;
    setActionError(null);
    setSavingEdit(true);
    try {
      await questionBankService.updateQuestion(q.id, { question_text: editText.trim() });
      setEditingId(null);
      await load();
    } catch (err) {
      fail(err, "Güncellenemedi.");
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
                {!chained && <span className="text-[10px] text-muted-foreground font-medium">{q.role} / {q.topic}</span>}
                <span className="text-[10px] text-muted-foreground font-medium">{q.times_served}x soruldu</span>
                {!q.is_active && <span className="text-[10px] text-muted-foreground font-bold">(pasif)</span>}
              </div>
            </>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => startEdit(q)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Düzenle" aria-label="Soruyu düzenle">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleToggleActive(q)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              title={q.is_active ? "Pasifleştir" : "Aktifleştir"}
              aria-label={q.is_active ? "Soruyu pasifleştir" : "Soruyu aktifleştir"}
            >
              {q.is_active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            {confirmDeleteId === q.id ? (
              <span className="flex items-center gap-2 text-xs pl-1">
                <span className="text-muted-foreground">Kalıcı olarak silinsin mi?</span>
                <button onClick={() => handleDelete(q)} className="font-bold text-destructive hover:underline">Evet, sil</button>
                <button onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground hover:underline">Vazgeç</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteId(q.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors" title="Sil" aria-label="Soruyu sil">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
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

      {actionError && (
        <div role="alert" className="mb-6 flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs underline shrink-0">
            Kapat
          </button>
        </div>
      )}

      {/* Yeni Soru Formu */}
      <div className="bg-card border border-border rounded-3xl shadow-sm p-6 mb-8">
        <h2 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Yeni Soru Ekle
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="qb-role" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Rol</label>
              <Input id="qb-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Örn: Backend Developer" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="qb-topic" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Konu</label>
              <Input id="qb-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Örn: Python" />
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
            <label htmlFor="qb-text" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Soru Metni</label>
            <Textarea id="qb-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Mülakat sorusunu buraya yazın..."
              className="min-h-[90px] text-[15px]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="qb-family" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Aile (opsiyonel)</label>
            <select id="qb-family"
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

          {formError && <p role="alert" className="text-xs text-destructive font-semibold">{formError}</p>}

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
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Boşluklar — bunlar için yeterli soru yok
            </h2>
            <Button type="button" size="sm" variant="outline" onClick={handleGenerateCandidates} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Öneriler üretiliyor...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Bu boşluklar için soru öner
                </>
              )}
            </Button>
          </div>
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
          <p className="text-[11px] text-muted-foreground mt-3">
            Öneriler yapay zeka tarafından üretilir ama doğrudan bankaya eklenmez — aşağıda onaylamanız/reddetmeniz gerekir.
          </p>
        </div>
      )}

      {/* Onay Bekleyen Öneriler */}
      {candidates.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-8">
          <h2 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Onay Bekleyen Öneriler ({candidates.length})
          </h2>
          <div className="space-y-3">
            {candidates.map((c) => {
              const isReviewing = reviewingId === c.id;
              return (
                <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                  <p className="text-sm text-foreground leading-relaxed">{c.question_text}</p>
                  <div className="flex items-center justify-between mt-2.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
                        {c.role} · {c.topic}
                        {c.difficulty ? ` · ${c.difficulty}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApproveCandidate(c)}
                        disabled={isReviewing}
                      >
                        {isReviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />} Onayla
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectCandidate(c)}
                        disabled={isReviewing}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" /> Reddet
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
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
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3" role="search" aria-label="Soru listesi filtreleri">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  aria-label="Soru ara"
                  placeholder="Soru, rol ya da konu ara"
                  value={search}
                  onChange={(e) => setFilter(setSearch)(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select aria-label="Konuya göre filtrele" value={filterTopic} onChange={(e) => setFilter(setFilterTopic)(e.target.value)} className={SELECT_CLASS}>
                <option value="">Tüm konular</option>
                {topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select aria-label="Zorluğa göre filtrele" value={filterDifficulty} onChange={(e) => setFilter(setFilterDifficulty)(e.target.value)} className={SELECT_CLASS}>
                <option value="">Tüm zorluklar</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                aria-label="Duruma göre filtrele"
                value={filterStatus}
                onChange={(e) => setFilter(setFilterStatus)(e.target.value as "all" | "active" | "passive")}
                className={SELECT_CLASS}
              >
                <option value="all">Aktif ve pasif</option>
                <option value="active">Yalnızca aktif</option>
                <option value="passive">Yalnızca pasif</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
              <p aria-live="polite">
                {filtering ? `${matchedCount} / ${questions.length} soru eşleşti` : `${questions.length} soru`}
              </p>
              {filtering && (
                <button
                  onClick={() => {
                    setSearch("");
                    setFilterTopic("");
                    setFilterDifficulty("");
                    setFilterStatus("all");
                    setPage(1);
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Filtreleri temizle
                </button>
              )}
            </div>
          </div>

          {entries.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Filtrelere uyan soru yok.</p>}

          {pageFamilies.map(({ fid, members }) => (
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

          {pageStandalone.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bağımsız Sorular</span>
              </div>
              <div className="divide-y divide-border/60">{pageStandalone.map((q) => renderRow(q, false))}</div>
            </div>
          )}

          {pageCount > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Sayfalar">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft className="w-4 h-4" /> Önceki
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums" aria-current="page">
                Sayfa {currentPage} / {pageCount}
              </span>
              <Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                Sonraki <ChevronRight className="w-4 h-4" />
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
