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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Gösterge Paneli
        </h1>
        <p className="text-slate-500 mt-2 text-base">
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
            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                  Tamamlanan Mülakatlar
                </CardTitle>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{completedInterviews.length} <span className="text-sm text-slate-500 font-normal">/ {totalInterviews} Toplam</span></div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                  Ortalama Başarı Puanı
                </CardTitle>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">%{avgScore}</div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                  Son Mülakat Tarihi
                </CardTitle>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 text-lg">
                  {lastInterviewDate}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg font-bold text-slate-800">
                Son Mülakatlar
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
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
                      let statusClass = "bg-blue-100 text-blue-700";
                      
                      if (interview.status === "completed") {
                        if (score >= 80) { statusText = "Başarılı"; statusClass = "bg-green-100 text-green-700"; }
                        else if (score >= 60) { statusText = "Geliştirilmeli"; statusClass = "bg-warning/20 text-warning-foreground"; }
                        else { statusText = "Zayıf"; statusClass = "bg-red-100 text-red-700"; }
                      }

                      return (
                        <tr 
                          key={interview.id} 
                          onClick={() => router.push(`/interviews/${interview.id}`)}
                          className={`bg-white hover:bg-slate-50 transition-colors cursor-pointer ${index !== Math.min(interviews.length, 5) - 1 ? "border-b border-slate-100" : ""}`}
                        >
                          <td className="px-6 py-4 font-medium text-slate-900">{interview.role}</td>
                          <td className="px-6 py-4 text-slate-600">{date}</td>
                          <td className="px-6 py-4 font-semibold text-slate-700">{interview.status === "completed" ? `%${score}` : "-"}</td>
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
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
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
