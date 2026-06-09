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
      <Card className="w-full bg-white shadow-lg border-slate-200">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">
            Kayıt Ol
          </CardTitle>
          <CardDescription className="text-slate-500">
            DeepInsight platformuna katılmak için hesap oluşturun
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorStr && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-200">
              {errorStr}
            </div>
          )}
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-slate-700"
                htmlFor="name"
              >
                Ad Soyad
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: John Doe"
                required
                className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent transition-all"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-slate-700"
                htmlFor="email"
              >
                E-posta
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
                required
                className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent transition-all"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-slate-700"
                htmlFor="target"
              >
                Hedef Pozisyon
              </label>
              <input
                id="target"
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Örn: Frontend Developer"
                required
                className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent transition-all"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-slate-700"
                htmlFor="password"
              >
                Şifre
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent transition-all"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-semibold leading-none text-slate-700"
                htmlFor="confirmPassword"
              >
                Şifre Tekrarı
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent transition-all"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? "Hesap Oluşturuluyor..." : "Kayıt Ol"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 text-center text-sm text-slate-600 pt-2">
          <div>
            Zaten hesabın var mı?{" "}
            <Link
              href="/login"
              className="font-bold text-blue-600 hover:text-blue-500 transition-colors"
            >
              Giriş Yap
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
