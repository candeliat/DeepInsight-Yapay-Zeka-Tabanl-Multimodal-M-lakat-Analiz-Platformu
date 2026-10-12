"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MailPlus, Upload, Loader2, Trash2, Clock } from "lucide-react";
import { orgService, parseInviteCsv, BulkInviteResult, OrgGroup, OrgInvite, ROLE_LABEL } from "@/services/orgService";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

export function InvitePanel({
  orgId,
  groups,
  canInviteInstructors,
  onInvited,
  onError,
}: {
  orgId: string;
  groups: OrgGroup[];
  canInviteInstructors: boolean;
  onInvited: () => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<"candidate" | "instructor">("candidate");
  const [groupId, setGroupId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [pending, setPending] = useState<OrgInvite[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = parseInviteCsv(text);
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;

  const loadPending = useCallback(async () => {
    try {
      setPending(await orgService.invites(orgId));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Davetler yüklenemedi.");
    }
  }, [orgId, onError]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    setResult(null);
    e.target.value = "";
  };

  const handleSend = async () => {
    if (rows.length === 0) return;
    setSending(true);
    try {
      const res = await orgService.bulkInvite(orgId, rows, role, groupId || undefined);
      setResult(res);
      setText("");
      await loadPending();
      onInvited(); // satırdaki grup adları yeni grup oluşturmuş olabilir
    } catch (e) {
      onError(e instanceof Error ? e.message : "Davet gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await orgService.deleteInvite(orgId, id);
      setPending((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Davet silinemedi.");
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
      <h2 className="font-bold text-foreground text-sm flex items-center gap-2 mb-1">
        <MailPlus className="w-4 h-4 text-primary" /> Toplu davet
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        CSV yükleyin ya da e-postaları yapıştırın (her satıra bir kişi; isteğe bağlı ikinci sütun grup adı). Kişiler kuruma ancak
        &quot;Kurumlarım&quot; sayfasında daveti kendileri kabul edince katılır.
      </p>

      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        placeholder={"email;grup\nali@okul.edu.tr;2026 Bahar - A\nayse@okul.edu.tr"}
        className="min-h-[96px] text-sm font-mono"
        aria-label="Davet edilecek e-postalar"
      />
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} className="hidden" />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" /> CSV seç
        </Button>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "candidate" | "instructor")}
          className="h-9 px-2 rounded-lg border border-border bg-background text-xs"
          aria-label="Davet rolü"
        >
          <option value="candidate">Öğrenci olarak</option>
          {canInviteInstructors && <option value="instructor">Eğitmen olarak</option>}
        </select>
        {groups.length > 0 && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 px-2 rounded-lg border border-border bg-background text-xs" aria-label="Varsayılan grup">
            <option value="">Grup: satırdaki / yok</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>Grup: {g.name}</option>
            ))}
          </select>
        )}
        <Button type="button" size="sm" onClick={handleSend} disabled={sending || rows.length === 0} className="ml-auto">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MailPlus className="w-3.5 h-3.5" />}
          {rows.length > 0 ? `${rows.length} kişiyi davet et` : "Davet et"}
        </Button>
      </div>

      {result && (
        <div role="status" className="mt-3 rounded-2xl bg-muted/50 px-4 py-3 text-xs space-y-1">
          <p className="font-semibold text-foreground">{result.invited} davet oluşturuldu.</p>
          {result.already_member.length > 0 && <p className="text-muted-foreground">Zaten üye ({result.already_member.length}): {result.already_member.join(", ")}</p>}
          {result.invalid.length > 0 && <p className="text-destructive">Geçersiz e-posta ({result.invalid.length}): {result.invalid.join(", ")}</p>}
          {result.truncated > 0 && <p className="text-warning">Tek seferde en fazla 500 kişi; {result.truncated} satır alınmadı.</p>}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Bekleyen davetler ({pending.length})</p>
          <ul className="divide-y divide-border/60 max-h-56 overflow-y-auto">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{i.email}</span>
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {ROLE_LABEL[i.role]}
                    {groupName(i.group_id) && ` · ${groupName(i.group_id)}`}
                  </span>
                </span>
                <button onClick={() => handleDelete(i.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive shrink-0" aria-label={`${i.email} davetini geri al`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
