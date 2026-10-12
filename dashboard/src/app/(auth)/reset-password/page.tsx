"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * E-postadaki şifre yenileme bağlantısı buraya döner. Supabase kurtarma token'ını
 * URL'nin # kısmında verir (sunucuya gitmez); token backend'e iletilip yeni şifre belirlenir.
 */
export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    if (accessToken && hash.get("type") === "recovery") {
      setToken(accessToken);
      // Token'ı adres çubuğundan ve tarayıcı geçmişinden kaldır.
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      setLinkError(hash.get("error_description")?.replace(/\+/g, " ") || "Bağlantı geçersiz ya da süresi dolmuş.");
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/auth/reset-password", { access_token: token, new_password: password });
      setDone(true);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Şifre güncellenemedi; yeniden sıfırlama isteyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-md p-4">
      <Card className="w-full">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="font-serif italic text-3xl font-medium text-foreground">Yeni şifre belirleyin</CardTitle>
          <CardDescription>En az 8 karakter kullanın.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div role="status" className="flex items-start gap-3 bg-success/10 text-success rounded-xl p-4 text-sm font-semibold">
              <CheckCircle2 className="w-5 h-5 shrink-0" /> Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz (web ve mobil).
            </div>
          ) : linkError ? (
            <p role="alert" className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl">
              {linkError} <Link href="/forgot-password" className="underline font-semibold">Yeni bağlantı isteyin.</Link>
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {error && <p role="alert" className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl">{error}</p>}
              <div className="space-y-2">
                <label htmlFor="pw" className="text-sm font-semibold text-foreground">Yeni şifre</label>
                <Input id="pw" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <label htmlFor="pw2" className="text-sm font-semibold text-foreground">Yeni şifre (tekrar)</label>
                <Input id="pw2" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={saving || !token}>
                {saving ? "Kaydediliyor..." : "Şifreyi güncelle"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-sm">
          <Link href="/login" className="font-bold text-primary hover:text-primary-hover">Girişe dön</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
