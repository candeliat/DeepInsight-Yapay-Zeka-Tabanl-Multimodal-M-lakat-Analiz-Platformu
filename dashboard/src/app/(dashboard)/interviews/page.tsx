"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Calendar, ChevronRight, Video, Briefcase, BarChart, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { chatService } from "@/services/chatService";
import { BAND_BADGE, scoreBand } from "@/lib/scoreBand";

export default function InterviewsPage() {
  const { user } = useAuthStore();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInterviews() {
      try {
        const data = await chatService.getMyInterviews();
        setInterviews(data);
      } catch {
        // Veri yüklenemedi — boş durum UI'si gösterilecek
      } finally {
        setLoading(false);
      }
    }
    loadInterviews();
  }, []);

  // Tek skor ölçeği (lib/scoreBand.ts) — diğer ekranlarla aynı eşik ve kelimeler.
  const getStatusInfo = (status: string, score: number) => {
    const band = status === "completed" ? scoreBand(score) : null;
    return band ? { variant: BAND_BADGE[band.tone], label: band.label } : { variant: "default" as const, label: "Yarıda kaldı" };
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif italic text-3xl text-foreground">
            Mülakat geçmişiniz
          </h1>
          <p className="text-muted-foreground mt-1">
            Tamamladığın mülakatların sonuçları; yarıda kalanlara kaldığın yerden devam edebilirsin.
          </p>
        </div>
        <Button className="gap-2 hidden sm:flex" asChild>
          <Link href="/chat/text">
            <Video className="w-4 h-4" />
            Yeni mülakat
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : interviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Video className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Henüz bir mülakat yapmadınız.</p>
            <Button className="mt-4" asChild>
              <Link href="/chat/text">İlk mülakatını başlat</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {interviews.map((interview) => {
            const avgScore = Math.round(interview.average_score || 0);
            const statusInfo = getStatusInfo(interview.status, avgScore);
            const formattedDate = new Date(interview.created_at).toLocaleDateString("tr-TR", { day: 'numeric', month: 'short', year: 'numeric' });

            return (
              <Link
                key={interview.id}
                href={interview.status === "completed" ? `/interviews/${interview.id}` : `/chat/text?resume=${interview.id}`}
                className="group block h-full"
              >
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <div className="flex items-start justify-between">
                      <Badge variant={statusInfo.variant} className="mb-2">
                        {statusInfo.label}
                      </Badge>
                      {interview.status === "completed" && (
                        <div className="flex items-center gap-1 text-primary font-bold bg-primary/10 px-2 py-1 rounded-md text-sm">
                          <BarChart className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Puan</span>
                          {avgScore}
                          <span className="sr-only">/ 100</span>
                        </div>
                      )}
                    </div>
                    <CardTitle className="text-lg line-clamp-1 mt-1 text-foreground">
                      {interview.role}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="pt-4 flex flex-col flex-1">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        <span>{formattedDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="w-4 h-4" />
                        <span className="truncate max-w-[120px]">{interview.topic}</span>
                      </div>
                    </div>

                    <div className="mt-auto">
                      <span className="flex w-full items-center justify-between rounded-xl bg-muted px-4 py-2.5 text-sm font-semibold text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        {interview.status === "completed" ? "Sonuçları gör" : "Kaldığın yerden devam et"}
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
