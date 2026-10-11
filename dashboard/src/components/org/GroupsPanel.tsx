"use client";

import React, { useState } from "react";
import { Layers, Plus, Trash2, Loader2 } from "lucide-react";
import { orgService, OrgGroup } from "@/services/orgService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function GroupsPanel({
  orgId,
  groups,
  onChanged,
  onError,
}: {
  orgId: string;
  groups: OrgGroup[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await orgService.createGroup(orgId, name.trim());
      setName("");
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Grup oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await orgService.deleteGroup(orgId, id);
      setConfirmDelete(null);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Grup silinemedi.");
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl shadow-sm p-6">
      <h2 className="font-bold text-foreground text-sm flex items-center gap-2 mb-1">
        <Layers className="w-4 h-4 text-primary" /> Gruplar ({groups.length})
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Sınıf, şube ya da dönem. Paneli ve ödevleri gruba göre daraltabilirsiniz; üyeyi gruba üye tablosundan atayın.
      </p>

      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yeni grup adı (örn. 2026 Bahar - A)" maxLength={60} aria-label="Yeni grup adı" />
        <Button type="submit" size="sm" disabled={saving || !name.trim()} className="shrink-0 h-11">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Ekle
        </Button>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz grup yok.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-foreground">{g.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{g.member_count} üye</span>
              </span>
              {confirmDelete === g.id ? (
                <span className="text-xs shrink-0">
                  <button onClick={() => handleDelete(g.id)} className="font-bold text-destructive hover:underline">Sil</button>
                  <button onClick={() => setConfirmDelete(null)} className="ml-2 text-muted-foreground hover:underline">Vazgeç</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(g.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive shrink-0"
                  aria-label={`${g.name} grubunu sil`}
                  title="Üyeler kurumda kalır, yalnızca grupsuz olur"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
