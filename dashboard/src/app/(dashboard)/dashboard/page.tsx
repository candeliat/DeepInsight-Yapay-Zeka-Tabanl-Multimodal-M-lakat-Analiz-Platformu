"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { ClipboardList, Target, Calendar, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { chatService } from "@/services/chatService";
import { useRouter } from "next/navigation";

export default function DashboardOverview() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!user?.id) return;
      try {
        const data = await chatService.getMyInterviews();
        setInterviews(data);
      } catch {
        // Veri yüklenemedi — boş durum UI'si gösterilecek
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [user?.id]);

  const completedInterviews = interviews.filter(i => i.status === "completed");
  const totalInterviews = interviews.length;

  const avgScore = completedInterviews.length > 0
    ? Math.round(completedInterviews.reduce((acc, curr) => acc + (curr.average_score || 0), 0) / completedInterviews.length)
    : 0;

  const lastInterviewDate = interviews.length > 0
    ? new Date(interviews[0].created_at).toLocaleDateString("tr-TR", { day: 'numeric', month: 'long', year: 'numeric' })
    : "-";

  const firstName = user?.user_metadata?.first_name;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="font-serif italic text-3xl text-foreground">
          {firstName ? `Merhaba, ${firstName}` : "Gösterge Paneli"}
        </h1>
        <p className="text-muted-foreground mt-2 text-base">
          Mülakat performansınızın genel özeti.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Tamamlanan Mülakatlar
                </CardTitle>
                <div className="p-2 bg-primary/10 rounded-xl">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="font-serif text-3xl text-foreground">{completedInterviews.length} <span className="font-sans text-sm text-muted-foreground font-normal">/ {totalInterviews} Toplam</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Ortalama Başarı Puanı
                </CardTitle>
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Target className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="font-serif text-3xl text-foreground">%{avgScore}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Son Mülakat Tarihi
                </CardTitle>
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="font-serif text-lg text-foreground">
                  {lastInterviewDate}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-lg font-bold text-foreground">
                Son Mülakatlar
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted border-b border-border">
                    <tr>
                      <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Pozisyon</th>
                      <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Tarih</th>
                      <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Skor</th>
                      <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.slice(0, 5).map((interview, index) => {
                      const score = Math.round(interview.average_score || 0);
                      const date = new Date(interview.created_at).toLocaleDateString("tr-TR");
                      let statusText = "Devam Ediyor";
                      let statusClass = "bg-primary/10 text-primary";

                      if (interview.status === "completed") {
                        if (score >= 80) { statusText = "Başarılı"; statusClass = "bg-success/15 text-success"; }
                        else if (score >= 60) { statusText = "Geliştirilmeli"; statusClass = "bg-warning/15 text-warning"; }
                        else { statusText = "Zayıf"; statusClass = "bg-destructive/15 text-destructive"; }
                      }

                      return (
                        <tr
                          key={interview.id}
                          onClick={() => router.push(`/interviews/${interview.id}`)}
                          className={`bg-card hover:bg-muted transition-colors cursor-pointer ${index !== Math.min(interviews.length, 5) - 1 ? "border-b border-border" : ""}`}
                        >
                          <td className="px-6 py-4 font-medium text-foreground">{interview.role}</td>
                          <td className="px-6 py-4 text-muted-foreground">{date}</td>
                          <td className="px-6 py-4 font-semibold text-foreground">{interview.status === "completed" ? `%${score}` : "-"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {interviews.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                          Henüz mülakat bulunmuyor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
