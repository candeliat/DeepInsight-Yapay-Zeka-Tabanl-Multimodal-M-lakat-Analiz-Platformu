"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorStr, setErrorStr] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorStr("");

    if (password !== confirmPassword) {
      setErrorStr("Şifreler eşleşmiyor!");
      return;
    }

    try {
      setIsLoading(true);
      // Splitting name to an approximate first and last name for Supabase metadata map
      const parts = name.trim().split(" ");
      const first_name = parts[0];
      const last_name = parts.slice(1).join(" ");

      await api.post("/api/v1/auth/register", {
        email,
        password,
        first_name,
        last_name,
        target
      });

      router.push("/login");
    } catch (err: any) {
      setErrorStr(err.response?.data?.detail || "Kayıt olurken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-4">
      <Card className="w-full">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="font-serif italic text-3xl font-medium text-foreground">
            Kariyerinize bir adım atın
          </CardTitle>
          <CardDescription>
            DeepInsight platformuna katılmak için hesap oluşturun
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorStr && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20">
              {errorStr}
            </div>
          )}
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-foreground"
                htmlFor="name"
              >
                Ad Soyad
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: John Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-foreground"
                htmlFor="email"
              >
                E-posta
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-foreground"
                htmlFor="target"
              >
                Hedef Pozisyon
              </label>
              <Input
                id="target"
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Örn: Frontend Developer"
                required
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-foreground"
                htmlFor="password"
              >
                Şifre
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-foreground"
                htmlFor="confirmPassword"
              >
                Şifre Tekrarı
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? "Hesap Oluşturuluyor..." : "Kayıt Ol"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 text-center text-sm text-muted-foreground pt-2">
          <div>
            Zaten hesabın var mı?{" "}
            <Link
              href="/login"
              className="font-bold text-primary hover:text-primary-hover transition-colors"
            >
              Giriş Yap
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
