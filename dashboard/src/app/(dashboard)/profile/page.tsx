"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { chatService } from "@/services/chatService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { 
  User, 
  Mail, 
  Briefcase, 
  Calendar, 
  Trophy, 
  ClipboardList, 
  LogOut, 
  Shield, 
  Loader2 
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!user?.id) return;
      try {
        const data = await chatService.getMyInterviews();
        setInterviews(data);
      } catch (e) {
        console.error("Mülakat istatistikleri yüklenemedi:", e);
      } finally {
        setLoadingStats(false);
      }
    }
    loadStats();
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const getInitials = (first?: string, last?: string) => {
    if (!first && !last) return "U";
    return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
  };

  const formatDate = (str?: string) => {
    if (!str) return "-";
    try {
      return new Date(str).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return str;
    }
  };

  const completedInterviews = interviews.filter((i) => i.status === "completed");
  const totalInterviews = interviews.length;
  
  const avgScore = completedInterviews.length > 0 
    ? Math.round(completedInterviews.reduce((acc, curr) => acc + (curr.average_score || 0), 0) / completedInterviews.length)
    : 0;

  const lastInterviewDate = interviews.length > 0 
    ? formatDate(interviews[0].created_at)
    : "Henüz Yok";

  if (!user) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || "";
  const lastName = user?.user_metadata?.last_name || "";
  const targetPosition = user?.user_metadata?.target || "Belirtilmemiş";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Profilim
        </h1>
        <p className="text-slate-500 mt-2 text-base">
          Kişisel bilgilerinizi ve mülakat istatistiklerinizi buradan yönetebilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sol Kolon - Avatar & Özet */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
            <div className="h-2 bg-primary w-full" />
            <CardContent className="pt-8 pb-6 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 text-primary flex items-center justify-center text-3xl font-extrabold mb-4 border border-primary/20">
                {getInitials(firstName, lastName)}
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {firstName} {lastName}
              </h2>
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-slate-400" />
                {user.email}
              </p>
              
              <div className="mt-4 flex flex-col gap-2 w-full justify-center items-center">
                <Badge variant="default" className="w-fit">
                  {user.user_metadata.role === 'admin' ? 'Yönetici' : 'Aday'}
                </Badge>
                {user.user_metadata.target && (
                  <Badge variant="outline" className="w-fit flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {targetPosition}
                  </Badge>
                )}
              </div>

              <div className="w-full border-t border-slate-100 my-6" />

              <Button 
                variant="destructive" 
                onClick={handleLogout} 
                className="w-full flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Çıkış Yap
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sağ Kolon - Detaylı Bilgiler & İstatistikler */}
        <div className="space-y-6 lg:col-span-2">
          {/* İstatistik Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Toplam Mülakat
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {loadingStats ? "-" : totalInterviews}
                    </p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg text-primary">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Ort. Başarı Puanı
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                      {loadingStats ? "-" : `%${avgScore}`}
                    </p>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <Trophy className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Son Katılım
                    </p>
                    <p className="text-lg font-bold text-slate-900 truncate max-w-[120px]">
                      {loadingStats ? "-" : lastInterviewDate}
                    </p>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Kişisel Bilgiler Detay */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Kişisel Bilgiler
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ad</label>
                  <p className="mt-1.5 text-base font-semibold text-slate-800 border border-slate-200 bg-slate-50 rounded-md px-3 py-2">
                    {firstName || "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Soyad</label>
                  <p className="mt-1.5 text-base font-semibold text-slate-800 border border-slate-200 bg-slate-50 rounded-md px-3 py-2">
                    {lastName || "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hedef Pozisyon</label>
                  <p className="mt-1.5 text-base font-semibold text-slate-800 border border-slate-200 bg-slate-50 rounded-md px-3 py-2">
                    {targetPosition}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">E-posta Adresi</label>
                  <p className="mt-1.5 text-base font-semibold text-slate-800 border border-slate-200 bg-slate-50 rounded-md px-3 py-2">
                    {user.email || "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hesap Bilgileri Detay */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Hesap Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kayıt Tarihi</label>
                  <p className="mt-1.5 text-base font-semibold text-slate-800 border border-slate-200 bg-slate-50 rounded-md px-3 py-2">
                    {formatDate(user.created_at)}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hesap Kimliği (UUID)</label>
                  <p className="mt-1.5 text-sm font-mono text-slate-800 border border-slate-200 bg-slate-50 rounded-md px-3 py-2 truncate" title={user.id}>
                    {user.id}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
