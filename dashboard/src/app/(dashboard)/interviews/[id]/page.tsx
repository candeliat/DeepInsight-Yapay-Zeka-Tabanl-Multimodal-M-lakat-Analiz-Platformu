"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { chatService } from "@/services/chatService";
import { 
  Loader2, 
  Brain, 
  Eye, 
  Volume2, 
  AlertCircle, 
  Clock, 
  Sparkles, 
  Smile, 
  UserCheck, 
  TrendingUp, 
  MessageSquare,
  ChevronRight
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie
} from "recharts";

export default function InterviewDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [interview, setInterview] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchDetailAndAnalytics() {
      if (!id) return;
      try {
        setLoading(true);
        // Mülakat detaylarını getir
        const interviewData = await chatService.getInterviewDetail(id);
        setInterview(interviewData);

        // Analiz sonuçlarını getir (varsa)
        try {
          const analyticsData = await chatService.getInterviewAnalytics(id);
          setAnalytics(analyticsData);
        } catch (analyticsErr) {
          console.warn("Bu mülakat için henüz AI video/ses analizi bulunamadı.", analyticsErr);
        }
      } catch (err: any) {
        setError(err.message || "Mülakat detayları yüklenirken hata oluştu.");
      } finally {
        setLoading(false);
      }
    }
    fetchDetailAndAnalytics();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-sm text-slate-500 font-medium animate-pulse">Rapor hazırlanıyor...</p>
        </div>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <div className="max-w-md w-full bg-red-50/50 border border-red-100 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Hata Oluştu</h3>
          <p className="text-sm text-red-600 font-medium mb-4">{error || "Mülakat bulunamadı."}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  // --- GRAFİK VERİLERİNİ HAZIRLA ---
  
  // 1. Radar Grafik Verisi (Gelişmiş)
  const stressScore = analytics?.emotion_distribution
    ? Math.round(
        (analytics.emotion_distribution.fear || 0) +
        (analytics.emotion_distribution.angry || 0) +
        (analytics.emotion_distribution.sad || 0) +
        (analytics.emotion_distribution.disgust || 0)
      )
    : 0;

  const chartData = [
    { subject: "Teknik Bilgi", A: interview.technical_score || 0, fullMark: 100 },
    { subject: "İletişim & Kelime", A: interview.vocabulary_score || 0, fullMark: 100 },
    { subject: "Göz Teması", A: analytics ? Math.round(analytics.eye_contact_pct) : 0, fullMark: 100 },
    { subject: "Stres Yönetimi", A: analytics ? Math.max(0, 100 - stressScore) : 100, fullMark: 100 },
    { subject: "Özgüven", A: analytics ? Math.round(analytics.confidence_pct) : (interview.confidence_score || 0), fullMark: 100 },
  ];

  // Eğer analiz yoksa sadece 3 ana puanı radar grafikte göster
  const fallbackChartData = [
    { subject: "Teknik Bilgi", A: interview.technical_score || 0, fullMark: 100 },
    { subject: "Özgüven", A: interview.confidence_score || 0, fullMark: 100 },
    { subject: "İletişim", A: interview.vocabulary_score || 0, fullMark: 100 },
  ];

  // 2. Duygu Dağılımı Verisi
  const emotionData = analytics?.emotion_distribution
    ? Object.entries(analytics.emotion_distribution)
        .map(([name, value]: any) => ({
          name: name === "happy" ? "Mutlu" :
                name === "sad" ? "Üzgün" :
                name === "angry" ? "Öfkeli" :
                name === "surprise" ? "Şaşkın" :
                name === "fear" ? "Korku" :
                name === "disgust" ? "Tiksinti" : "Nötr",
          value: parseFloat(value.toFixed(1))
        }))
        .filter(item => item.value > 0)
    : [];

  const EMOTION_COLORS = {
    "Mutlu": "#10b981",    // Emerald
    "Üzgün": "#3b82f6",    // Blue
    "Öfkeli": "#ef4444",   // Red
    "Şaşkın": "#f59e0b",  // Amber
    "Korku": "#8b5cf6",    // Purple
    "Tiksinti": "#6b7280", // Gray
    "Nötr": "#64748b"      // Slate
  };

  // 3. Dolgu Kelimeleri Verisi
  const fillerWordsData = analytics?.filler_words_detail
    ? Object.entries(analytics.filler_words_detail).map(([name, count]: any) => ({
        name: name.toUpperCase(),
        Adet: count
      }))
    : [];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const avgScore = Math.round(interview.average_score || 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* ÜST BAŞLIK BÖLÜMÜ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
              Mülakat Tamamlandı
            </span>
            {analytics && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600 flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-pulse" /> AI Analiz Raporu Aktif
              </span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2">
            Mülakat Sonuç Raporu
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {interview.role} Pozisyonu • {formatDate(interview.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 px-6 py-4 rounded-2xl">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">GENEL SKOR</p>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              %{avgScore}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md">
            A
          </div>
        </div>
      </div>

      {/* YAPAY ZEKA GÖRSEL METRİKLER (STATS GRID) */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          <MetricCard 
            title="Göz Teması" 
            value={`%${Math.round(analytics.eye_contact_pct)}`} 
            desc="Kameraya bakış sıklığı" 
            icon={<Eye className="w-5 h-5 text-blue-600" />}
            colorClass="bg-blue-50 text-blue-700 border-blue-100"
          />
          <MetricCard 
            title="Özgüven Oranı" 
            value={`%${Math.round(analytics.confidence_pct)}`} 
            desc="İletişim ve duruş analizi" 
            icon={<UserCheck className="w-5 h-5 text-indigo-600" />}
            colorClass="bg-indigo-50 text-indigo-700 border-indigo-100"
          />
          <MetricCard 
            title="Konuşma Hızı" 
            value={`${Math.round(analytics.speech_rate_wpm)} WPM`} 
            desc={analytics.speech_rate_wpm >= 120 && analytics.speech_rate_wpm <= 160 ? "Mükemmel tempoda" : "Yavaş tempoda"} 
            icon={<Volume2 className="w-5 h-5 text-emerald-600" />}
            colorClass="bg-emerald-50 text-emerald-700 border-emerald-100"
          />
          <MetricCard 
            title="Duraksama & Dolgu" 
            value={`${analytics.pause_count} D. / ${analytics.filler_word_count} F.`} 
            desc="Duraksama ve dolgu kelime adeti" 
            icon={<Clock className="w-5 h-5 text-amber-600" />}
            colorClass="bg-amber-50 text-amber-700 border-amber-100"
          />
        </div>
      )}

      {/* GRAFİKLER BÖLÜMÜ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Performans Radar Grafiği */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600"></div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Bütünsel Performans Analizi
          </h2>
          <div className="flex-1 min-h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={analytics ? chartData : fallbackChartData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8' }} />
                <Radar
                  name="Aday"
                  dataKey="A"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="#3b82f6"
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Yapay Zeka Geri Bildirimi */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col hover:shadow-md transition-shadow relative">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-600"></div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            Yapay Zeka Değerlendirmesi
          </h2>
          <div className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed overflow-y-auto max-h-[300px] whitespace-pre-wrap pr-4 scrollbar-thin scrollbar-thumb-slate-200">
            {interview.feedback ? interview.feedback : "Henüz değerlendirme bulunmuyor. Mülakat tamamlanmamış olabilir."}
          </div>
        </div>

      </div>

      {/* AI SES VE YÜZ ANALİZ DETAYLARI GRAFİKLERİ */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-700">
          
          {/* Duygu Durum Dağılımı (Pie Chart) */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col hover:shadow-md transition-shadow relative">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600"></div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
              <Smile className="w-5 h-5 text-emerald-600" />
              Duygu Durum Dağılımı
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 min-h-[250px]">
              <div className="flex-1 w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={emotionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {emotionData.map((entry: any, index: number) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={(EMOTION_COLORS as any)[entry.name] || "#cbd5e1"} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [`%${value}`, "Oran"]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend listesi */}
              <div className="flex-1 space-y-3 w-full sm:w-auto">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Baskın Duygu: <span className="text-slate-900 dark:text-white font-extrabold">
                  {analytics.dominant_emotion === "happy" ? "MUTLU" :
                   analytics.dominant_emotion === "sad" ? "ÜZGÜN" :
                   analytics.dominant_emotion === "angry" ? "ÖFKELİ" :
                   analytics.dominant_emotion === "surprise" ? "ŞAŞKIN" :
                   analytics.dominant_emotion === "fear" ? "KORKU" :
                   analytics.dominant_emotion === "disgust" ? "TİKSİNTİ" : "NÖTR"}
                </span></p>
                
                <div className="grid grid-cols-2 gap-2">
                  {emotionData.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: (EMOTION_COLORS as any)[entry.name] || "#cbd5e1" }}
                      />
                      <span>{entry.name}: %{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dolgu Kelime Analizi (Bar Chart) */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col hover:shadow-md transition-shadow relative">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-600"></div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-amber-600" />
              Dolgu Kelime Sıklığı
            </h2>
            <div className="flex-1 min-h-[220px] flex items-center justify-center">
              {fillerWordsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={fillerWordsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }} 
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                    />
                    <Bar dataKey="Adet" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={28}>
                      {fillerWordsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="#f59e0b" fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm font-medium text-slate-500">Mülakat boyunca hiç dolgu kelimesi kullanılmadı! Mükemmel iletişim.</p>
              )}
            </div>
          </div>

        </div>
      )}

      {/* AI DEŞİFRE / TRANSKRİPT */}
      {analytics?.transcript && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col hover:shadow-md transition-shadow relative">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            Mülakat Ses Kaydı Deşifresi (Transkript)
          </h2>
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl text-slate-700 dark:text-slate-300 text-sm leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin">
            "{analytics.transcript}"
          </div>
        </div>
      )}

      {/* MESAJ GEÇMİŞİ */}
      {interview.messages && interview.messages.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-800 dark:text-slate-200" />
              Soru ve Cevap Geçmişi
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {interview.messages.map((msg: any, i: number) => (
              <div key={i} className={`p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/20 ${msg.role === 'model' ? 'bg-slate-50/20 dark:bg-slate-800/10' : 'bg-white dark:bg-slate-900'}`}>
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${msg.role === 'model' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {msg.role === 'model' ? 'Yapay Zeka Sorusu' : 'Sizin Yanıtınız'}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Stats Card Bileşeni
function MetricCard({ title, value, desc, icon, colorClass }: { title: string; value: string; desc: string; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className={`p-6 border rounded-3xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow flex items-start gap-4 bg-white dark:bg-slate-900`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${colorClass.split(' ')[0]} ${colorClass.split(' ')[2]}`}>
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{title}</h3>
        <div className="text-2xl font-black text-slate-900 dark:text-white">{value}</div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{desc}</p>
      </div>
    </div>
  );
}
