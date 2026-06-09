"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errorStr, setErrorStr] = useState("");
  const { setToken, fetchProfile, isLoading } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorStr("");
    
    try {
      const response = await api.post("/api/v1/auth/login", {
        email,
        password,
      });
      
      const { access_token } = response.data;
      setToken(access_token);
      await fetchProfile(); // Automatically load the user profile
      
      router.push("/dashboard");
    } catch (err: any) {
      setErrorStr(err.response?.data?.detail || "Giriş başarısız, lütfen bilgilerinizi kontrol edin.");
    }
  };

  return (
    <div className="w-full max-w-md p-4">
      <Card className="w-full bg-white shadow-lg border-slate-200">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">
            Giriş Yap
          </CardTitle>
          <CardDescription className="text-slate-500">
            DeepInsight komuta merkezine erişmek için bilgilerinizi girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorStr && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-200">
              {errorStr}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-5">
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
              <div className="flex items-center justify-between">
                <label
                  className="text-sm font-semibold leading-none text-slate-700"
                  htmlFor="password"
                >
                  Şifre
                </label>
                <Link
                  href="#"
                  className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                >
                  Şifremi unuttum
                </Link>
              </div>
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
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? "Giriş Yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 text-center text-sm text-slate-600 pt-2">
          <div>
            Hesabın yok mu?{" "}
            <Link
              href="/register"
              className="font-bold text-blue-600 hover:text-blue-500 transition-colors"
            >
              Kayıt Ol
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
