"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.post("/api/v1/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch {
      setError("İstek gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full max-w-md p-4">
      <Card className="w-full">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="font-serif italic text-3xl font-medium text-foreground">Şifrenizi mi unuttunuz?</CardTitle>
          <CardDescription>E-posta adresinizi yazın; şifrenizi yenilemeniz için bir bağlantı gönderelim.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div role="status" className="flex items-start gap-3 bg-success/10 text-success rounded-xl p-4 text-sm font-semibold">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Bu e-postayla kayıtlı bir hesap varsa şifre yenileme bağlantısı gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.</span>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {error && <p role="alert" className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl">{error}</p>}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-foreground">E-posta</label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@sirket.com" required />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={sending}>
                {sending ? "Gönderiliyor..." : "Bağlantı gönder"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          <Link href="/login" className="font-bold text-primary hover:text-primary-hover">Girişe dön</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
