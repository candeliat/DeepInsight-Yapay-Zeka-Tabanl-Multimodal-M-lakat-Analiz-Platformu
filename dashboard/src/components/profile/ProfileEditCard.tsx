"use client";

import React, { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, User } from "lucide-react";
import { accountService } from "@/services/accountService";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const labelClass = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";

/** Ad, soyad ve hedef pozisyon düzenleme. Hedef pozisyon mülakat kurulumunda rolü önceden doldurur. */
export function ProfileEditCard() {
  const { user, fetchProfile } = useAuthStore();
  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
  const [firstName, setFirstName] = useState(meta.first_name ?? "");
  const [lastName, setLastName] = useState(meta.last_name ?? "");
  const [target, setTarget] = useState(meta.target ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await accountService.updateProfile({ first_name: firstName.trim(), last_name: lastName.trim(), target: target.trim() });
      await fetchProfile();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
          <User className="w-5 h-5 text-primary" /> Kişisel Bilgiler
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className={labelClass}>Ad</span>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Soyad</span>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className={labelClass}>Hedef pozisyon</span>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} maxLength={80} placeholder="Örn: Frontend Developer" />
              <span className="block text-xs text-muted-foreground">Mülakat kurulumunda rol alanını bununla doldururuz.</span>
            </label>
            <div className="space-y-1.5 md:col-span-2">
              <span className={labelClass}>E-posta</span>
              <p className="text-sm text-foreground">{user?.email}</p>
            </div>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Kaydet
            </Button>
            {saved && (
              <span role="status" className="text-sm text-success font-semibold inline-flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Kaydedildi
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError("Yeni şifreler eşleşmiyor.");
      return;
    }
    setSaving(true);
    try {
      await accountService.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre değiştirilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" /> Şifre
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <label className="space-y-1.5">
            <span className={labelClass}>Mevcut şifre</span>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>Yeni şifre</span>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required autoComplete="new-password" />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>Yeni şifre (tekrar)</span>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
          </label>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Şifreyi değiştir
            </Button>
            {done && <span role="status" className="text-sm text-success font-semibold">Şifreniz güncellendi.</span>}
            {error && <span role="alert" className="text-sm text-destructive font-semibold">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
