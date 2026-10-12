"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { chatService } from "@/services/chatService";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Mail,
  Briefcase,
  Calendar,
  Trophy,
  ClipboardList,
  LogOut,
  Loader2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { DataRightsCard } from "@/components/profile/DataRightsCard";
import { PasswordCard, ProfileEditCard } from "@/components/profile/ProfileEditCard";

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [interviews, setInterviews] = useState<{ status: string; average_score?: number | null; created_at: string }[]>([]);
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

  const labelClass = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="font-serif italic text-3xl text-foreground">
          Profiliniz
        </h1>
        <p className="text-muted-foreground mt-2 text-base">
          Kişisel bilgilerinizi ve mülakat istatistiklerinizi buradan yönetebilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sol Kolon - Avatar & Özet */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="overflow-hidden">
            <div className="h-2 bg-primary w-full" />
            <CardContent className="pt-8 pb-6 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 text-primary flex items-center justify-center text-3xl font-serif mb-4 border border-primary/20">
                {getInitials(firstName, lastName)}
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {firstName} {lastName}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                {user.email}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Üyelik: {formatDate(user.created_at)}</p>

              <div className="mt-4 flex flex-col gap-2 w-full justify-center items-center">
                <Badge variant="default" className="w-fit">
                  {user.app_metadata?.role === 'admin' ? 'Platform yöneticisi' : 'Aday'}
                </Badge>
                {user.user_metadata.target && (
                  <Badge variant="outline" className="w-fit flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {targetPosition}
                  </Badge>
                )}
              </div>

              <div className="w-full border-t border-border my-6" />

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
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className={labelClass}>
                      Toplam Mülakat
                    </p>
                    <p className="font-serif text-2xl text-foreground">
                      {loadingStats ? "-" : totalInterviews}
                    </p>
                  </div>
                  <div className="p-2 bg-primary/10 rounded-xl text-primary">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className={labelClass}>
                      Ort. Başarı Puanı
                    </p>
                    <p className="font-serif text-2xl text-foreground">
                      {loadingStats ? "-" : completedInterviews.length ? avgScore : "–"}
                    </p>
                  </div>
                  <div className="p-2 bg-success/10 rounded-xl text-success">
                    <Trophy className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className={labelClass}>
                      Son Katılım
                    </p>
                    <p className="font-serif text-lg text-foreground truncate max-w-[120px]">
                      {loadingStats ? "-" : lastInterviewDate}
                    </p>
                  </div>
                  <div className="p-2 bg-warning/10 rounded-xl text-warning">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <ProfileEditCard />

          <PasswordCard />

          <DataRightsCard email={user.email} />
        </div>
      </div>
    </div>
  );
}
