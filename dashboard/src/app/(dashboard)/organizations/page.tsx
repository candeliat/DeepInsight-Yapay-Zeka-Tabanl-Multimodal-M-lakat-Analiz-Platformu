"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, XCircle, LogIn, Plus, ArrowRight, ShieldCheck, CheckCircle2, MailOpen } from "lucide-react";
import { orgService, MyInvite, MyOrganization, ROLE_LABEL } from "@/services/orgService";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function OrganizationsPage() {
  const { user } = useAuthStore();
  const isPlatformAdmin = user?.app_metadata?.role === "admin";

  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, pending] = await Promise.all([orgService.myOrganizations(), orgService.myInvites()]);
      setOrgs(mine);
      setInvites(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoining(true);
    setError(null);
    setNotice(null);
    try {
      const org = await orgService.join(inviteCode.trim());
      setInviteCode("");
      setNotice(`"${org.name}" kurumuna katıldınız.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Katılınamadı.");
    } finally {
      setJoining(false);
    }
  };

  const handleRespond = async (invite: MyInvite, accept: boolean) => {
    setRespondingId(invite.id);
    setError(null);
    setNotice(null);
    try {
      await orgService.respondInvite(invite.id, accept);
      setNotice(accept ? `"${invite.org_name ?? "Kurum"}" kurumuna katıldınız.` : "Davet reddedildi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Davet yanıtlanamadı.");
    } finally {
      setRespondingId(null);
    }
  };

  const handleToggleSharing = async (org: MyOrganization) => {
    setTogglingId(org.id);
    setError(null);
    try {
      const { share_progress } = await orgService.setSharing(org.id, !org.share_progress);
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, share_progress } : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncellenemedi.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const org = await orgService.create(newName.trim(), newAdminEmail.trim() || undefined);
      setNewName("");
      setNewAdminEmail("");
      setNotice(`"${org.name}" oluşturuldu. Davet kodu: ${org.invite_code}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kurum oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Building2 className="w-7 h-7" />
        </div>
        <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Kurumlarım</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Üniversite kariyer merkezi, bootcamp gibi kurumlara davet koduyla katılın ve neyi paylaşacağınızı siz seçin.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 flex items-start gap-3 bg-success/10 border border-success/20 text-success rounded-2xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{notice}</span>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mb-6 space-y-3">
          {invites.map((inv) => (
            <div key={inv.id} className="bg-primary/5 border border-primary/20 rounded-3xl p-5 flex items-start gap-3 flex-wrap">
              <MailOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-semibold text-foreground">
                  {inv.org_name ?? "Bir kurum"} sizi {ROLE_LABEL[inv.role].toLocaleLowerCase("tr")} olarak davet etti
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Kabul ederseniz kurum adına yaptığınız mülakatlara katılımınızı eğitmenler görür; skor paylaşımı ayrıca sizin izninize bağlıdır.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => handleRespond(inv, false)} disabled={respondingId === inv.id}>
                  Reddet
                </Button>
                <Button size="sm" onClick={() => handleRespond(inv, true)} disabled={respondingId === inv.id}>
                  {respondingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Kabul et
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleJoin} className="bg-card border border-border rounded-3xl shadow-sm p-5 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="invite" className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Davet kodu</label>
          <Input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Kurumunuzun verdiği kod" maxLength={64} />
        </div>
        <Button type="submit" disabled={joining || !inviteCode.trim()}>
          {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Katıl
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : orgs.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-10 text-center text-sm text-muted-foreground">
          Henüz bir kuruma üye değilsiniz.
        </div>
      ) : (
        <ul className="space-y-3">
          {orgs.map((org) => {
            const isStaff = org.role === "org_admin" || org.role === "instructor";
            return (
              <li key={org.id} className="bg-card border border-border rounded-3xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-foreground">{org.name}</p>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{ROLE_LABEL[org.role]}</span>
                  </div>
                  {isStaff && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/organizations/${org.id}`}>
                        Kurum paneli <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  )}
                </div>
                {org.role === "candidate" && (
                  <div className="mt-4 pt-4 border-t border-border flex items-start justify-between gap-4">
                    <div className="text-xs">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-primary" /> İlerlememi eğitmenlerle paylaş
                      </p>
                      <p className="text-muted-foreground mt-1 leading-relaxed">
                        Kapalıyken eğitmenler yalnızca bu kurum adına kaç mülakat yaptığınızı görür; skorlarınız yalnızca
                        en az 3 öğrencilik toplu istatistiklere katılır. Açarsanız kurum adına yaptığınız mülakatların
                        skorlarını ve gelişim raporunuzu görebilirler. Bireysel mülakatlarınız hiçbir durumda paylaşılmaz.
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={org.share_progress}
                      aria-label={`${org.name} ile ilerleme paylaşımı`}
                      onClick={() => handleToggleSharing(org)}
                      disabled={togglingId === org.id}
                      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
                        org.share_progress ? "bg-primary" : "bg-muted border border-border"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                          org.share_progress ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isPlatformAdmin && (
        <form onSubmit={handleCreate} className="mt-8 bg-card border border-dashed border-border rounded-3xl p-5 space-y-3">
          <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Yeni kurum (platform yöneticisi)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input aria-label="Kurum adı" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Kurum adı" minLength={2} maxLength={120} required />
            <Input
              type="email"
              aria-label="Kurum yöneticisinin e-postası (opsiyonel)"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="Kurum yöneticisinin e-postası (opsiyonel)"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">E-posta verilmezse kurumun yöneticisi siz olursunuz.</p>
          <Button type="submit" size="sm" disabled={creating || newName.trim().length < 2}>
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Kurum oluştur
          </Button>
        </form>
      )}
    </div>
  );
}
