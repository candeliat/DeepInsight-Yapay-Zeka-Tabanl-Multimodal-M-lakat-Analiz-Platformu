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
import { Input } from "@/components/ui/Input";

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
      <Card className="w-full">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="font-serif italic text-3xl font-medium text-foreground">
            Tekrar hoş geldiniz
          </CardTitle>
          <CardDescription>
            DeepInsight komuta merkezine erişmek için bilgilerinizi girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorStr && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20">
              {errorStr}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-5">
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
              <div className="flex items-center justify-between">
                <label
                  className="text-sm font-semibold leading-none text-foreground"
                  htmlFor="password"
                >
                  Şifre
                </label>
                <Link
                  href="#"
                  className="text-sm font-medium text-primary hover:text-primary-hover transition-colors"
                >
                  Şifremi unuttum
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? "Giriş Yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 text-center text-sm text-muted-foreground pt-2">
          <div>
            Hesabın yok mu?{" "}
            <Link
              href="/register"
              className="font-bold text-primary hover:text-primary-hover transition-colors"
            >
              Kayıt Ol
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
