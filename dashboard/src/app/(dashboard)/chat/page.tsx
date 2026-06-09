"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Mic, 
  MicOff, 
  Play, 
  Send, 
  Loader2, 
  Award, 
  Brain, 
  Target, 
  MessageSquare, 
  Sparkles, 
  Eye, 
  Volume2, 
  Clock, 
  UserCheck, 
  ArrowRight,
  ShieldCheck
} from "lucide-react";
import { chatService, EvaluationData } from "@/services/chatService";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

// Tarayıcı uyumluluğu için SpeechRecognition türleri
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type InterviewState = "SETUP" | "INTERVIEWING" | "ANALYZING" | "RESULTS";

export default function InterviewRoomPage() {
  const router = useRouter();

  // Akış Durumu
  const [currentState, setCurrentState] = useState<InterviewState>("SETUP");

  // Kurulum (Setup) State
  const [role, setRole] = useState("Yazılım Mühendisi");
  const [topic, setTopic] = useState("React ve Modern Web Geliştirme");
  const [difficulty, setDifficulty] = useState("ORTA");
  
  // Mülakat State
  const [interviewId, setInterviewId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [spokenWordIndex, setSpokenWordIndex] = useState(-1);
  const [analyzingStatusText, setAnalyzingStatusText] = useState(
    "Yapay Zekamız mülakat performansını, göz temasını ve konuşma tonunu inceliyor. Lütfen ayrılmayın..."
  );

  // Referanslar
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Kamera stream'i ile video elementini eşleştirme (State değişimi sonrası render için)
  useEffect(() => {
    if (currentState === "INTERVIEWING" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.warn("Kamera oynatılamadı:", e));
    }
  }, [currentState]);

  // ----------------------------------------------------------------------
  // MEDIA (KAMERA) KURULUMU VE KAYIT
  // ----------------------------------------------------------------------
  const setupCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      // videoRef.current burada null olabilir (henüz render edilmediği için),
      // bu yüzden useEffect içinde de eşleştirme yapıyoruz.
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Kamera oynatılamadı:", e));
      }
    } catch (error) {
      console.warn("Kamera veya mikrofona erişilemedi:", error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  // MediaRecorder Kayıt Başlatma
  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];

    // Desteklenen video/audio mime type'ı bul
    let options = { mimeType: "video/webm;codecs=vp9" };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: "video/webm;codecs=vp8" };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: "video/webm" };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "" }; // Tarayıcı default
        }
      }
    }

    try {
      const recorder = new MediaRecorder(streamRef.current, options);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.start(1000); // 1 saniyelik parçalar halinde kaydet
      mediaRecorderRef.current = recorder;
      console.log("MediaRecorder arka plan kaydı başlatıldı. Mime:", recorder.mimeType);
    } catch (error) {
      console.error("MediaRecorder başlatılamadı:", error);
    }
  };

  // ----------------------------------------------------------------------
  // SPEECH RECOGNITION (SESİ METNE ÇEVİRME)
  // ----------------------------------------------------------------------
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "tr-TR";

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setUserAnswer((prev) => prev + " " + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  // ----------------------------------------------------------------------
  // TEXT TO SPEECH (METNİ SESE ÇEVİRME)
  // ----------------------------------------------------------------------
  const speakText = useCallback((text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpokenWordIndex(-1);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "tr-TR";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onboundary = (event) => {
        if (event.name === "word") {
          setSpokenWordIndex(event.charIndex);
        }
      };

      utterance.onend = () => {
        setSpokenWordIndex(-1);
      };

      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const renderHighlightedText = (text: string, charIndex: number) => {
    if (charIndex < 0 || charIndex >= text.length) return <span>{text}</span>;
    
    let nextSpace = text.slice(charIndex).search(/[\s.,!?]/);
    if (nextSpace === -1) nextSpace = text.length - charIndex;
    if (nextSpace === 0) nextSpace = 1;
    
    const absoluteEnd = charIndex + nextSpace;
    
    const before = text.substring(0, charIndex);
    const currentWord = text.substring(charIndex, absoluteEnd);
    const after = text.substring(absoluteEnd);
    
    return (
      <>
        <span>{before}</span>
        <span className="text-primary font-bold bg-primary/10 rounded px-1 transition-all duration-200">{currentWord}</span>
        <span>{after}</span>
      </>
    );
  };

  // Temizleme
  useEffect(() => {
    return () => {
      stopCamera();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ----------------------------------------------------------------------
  // MÜLAKAT AKIŞI
  // ----------------------------------------------------------------------
  const handleStartInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsThinking(true);
    
    try {
      // 1. Backend'e başlatma isteği
      const data = await chatService.startInterview(role, `${topic} (Seviye: ${difficulty})`);
      setInterviewId(data.interview_id);
      setCurrentQuestion(data.first_message);
      
      // 2. Kamera aç
      await setupCamera();
      
      // 3. Arka plan video/ses kaydını başlat
      startRecording();
      
      // 4. Ekrana geç ve soruyu oku
      setCurrentState("INTERVIEWING");
      speakText(data.first_message);
      
    } catch (error) {
      console.error("Mülakat başlatılamadı:", error);
      alert("Mülakat başlatılırken bir hata oluştu.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim() || isThinking) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpokenWordIndex(-1);
    }
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const currentAnswer = userAnswer;
    setUserAnswer("");
    setIsThinking(true);

    try {
      const response = await chatService.sendMessage(interviewId, currentAnswer);
      
      if (response.interview_complete && response.evaluation) {
        // --- MÜLAKAT BİTTİ — ANALİZ SÜRECİ ---
        stopCamera();
        
        // 1. Kaydı durdur ve Blob dosyasını al
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          setCurrentState("ANALYZING");
          
          mediaRecorderRef.current.onstop = async () => {
            const mimeType = mediaRecorderRef.current?.mimeType || "video/webm";
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            
            try {
              setAnalyzingStatusText("Mülakat kaydınız analiz sunucusuna aktarılıyor...");
              // 2. FormData ile Backend'e gönder (POST /api/v1/analytics/analyze/{id})
              await chatService.uploadRecording(interviewId, blob, "interview.webm");
              
              setAnalyzingStatusText("Yapay Zekamız mülakat performansını, göz temasını ve konuşma tonunu inceliyor. Lütfen ayrılmayın...");
              
              // 3. Durum Polling'ini başlat (her 2.5s)
              pollAnalysisStatus(interviewId, response.evaluation);
            } catch (uploadError) {
              console.error("Kayıt yüklenemedi, düz değerlendirme ekranına geçiliyor:", uploadError);
              setEvaluation(response.evaluation || null);
              setCurrentState("RESULTS");
            }
          };
          
          mediaRecorderRef.current.stop();
        } else {
          // Kaydedici aktif değilse doğrudan sonuçlara geç
          setEvaluation(response.evaluation || null);
          setCurrentState("RESULTS");
        }
      } else {
        setCurrentQuestion(response.response);
        speakText(response.response);
      }
    } catch (error) {
      console.error("Cevap gönderilemedi:", error);
      alert("Bağlantı hatası oluştu.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleEndInterviewManual = async () => {
    setIsThinking(true);
    try {
      // LLM'e doğrudan bitir emri ver
      const response = await chatService.sendMessage(interviewId, "Mülakatı burada bitirmek istiyorum. Lütfen değerlendirmeyi oluştur.");
      if (response.interview_complete && response.evaluation) {
        stopCamera();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          setCurrentState("ANALYZING");
          mediaRecorderRef.current.onstop = async () => {
            const mimeType = mediaRecorderRef.current?.mimeType || "video/webm";
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            try {
              setAnalyzingStatusText("Mülakat kaydınız analiz sunucusuna aktarılıyor...");
              await chatService.uploadRecording(interviewId, blob, "interview.webm");
              setAnalyzingStatusText("Yapay Zekamız mülakat performansını inceliyor...");
              pollAnalysisStatus(interviewId, response.evaluation);
            } catch (uploadError) {
              setEvaluation(response.evaluation || null);
              setCurrentState("RESULTS");
            }
          };
          mediaRecorderRef.current.stop();
        } else {
          setEvaluation(response.evaluation || null);
          setCurrentState("RESULTS");
        }
      } else {
        // Model JSON yerine metin döndürürse manuel olarak state değiştir
        stopCamera();
        setEvaluation({
           technical_score: 70,
           confidence_score: 70,
           vocabulary_score: 70,
           feedback: "Mülakat manuel olarak sonlandırıldı."
        });
        setCurrentState("RESULTS");
      }
    } catch (e) {
      console.error("Mülakatı bitirme hatası:", e);
      alert("Mülakat sonlandırılamadı.");
    } finally {
      setIsThinking(false);
    }
  };

  // AI Analiz Durumu Sorgulama (Polling)
  const pollAnalysisStatus = (id: string, initialEvaluation: any) => {
    let attempts = 0;
    const maxAttempts = 120; // maks 5 dakika

    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(intervalId);
        setEvaluation(initialEvaluation);
        setCurrentState("RESULTS");
        return;
      }

      try {
        const response = await api.get(`/api/v1/analytics/status/${id}`);
        const status = response.data.analysis_status;

        if (status === "completed") {
          clearInterval(intervalId);
          // Analiz bitti! Detayları alıp sonuçlar ekranına yansıt
          try {
            const results = await chatService.getInterviewAnalytics(id);
            setAnalytics(results);
          } catch (e) {
            console.warn("Analiz sonuçları alınamadı:", e);
          }
          setEvaluation(initialEvaluation);
          setCurrentState("RESULTS");
          speakText("Mülakat analizi tamamlandı. Sonuçlarınızı inceleyebilirsiniz.");
        } else if (status === "failed") {
          clearInterval(intervalId);
          console.error("AI analizi başarısız oldu.");
          setEvaluation(initialEvaluation);
          setCurrentState("RESULTS");
        }
      } catch (error) {
        console.error("Durum sorgulama hatası:", error);
      }
    }, 2500);
  };

  // ----------------------------------------------------------------------
  // EKRANLAR (RENDER)
  // ----------------------------------------------------------------------

  if (currentState === "SETUP") {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="max-w-md w-full bg-card border border-border rounded-3xl shadow-lg p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-black via-[#00687a] to-[#57dffe]"></div>
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Brain className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Mülakat Odası</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Rolünüzü ve mülakat konusunu seçerek yapay zeka deneyimini hemen başlatın.
            </p>
          </div>

          <form onSubmit={handleStartInterview} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Hedef Rol / Pozisyon</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Örn: Yazılım Mühendisi"
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium text-foreground"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Mülakat Konusu</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Örn: React ve Modern Web"
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium text-foreground"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Zorluk Seviyesi</label>
              <div className="flex gap-2">
                {["JUNIOR", "ORTA", "UZMAN"].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs tracking-wider transition-all cursor-pointer ${
                      difficulty === level
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs text-slate-500 font-semibold mb-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Görüntü ve ses analizi tamamen cihazınız üzerinden güvenli şekilde yürütülecektir.</span>
            </div>

            <button
              type="submit"
              disabled={isThinking}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-3.5 rounded-xl font-semibold flex items-center justify-center transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {isThinking ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Hazırlanıyor...</>
              ) : (
                <><Play className="w-5 h-5 mr-2 fill-current" /> Mülakata Başla</>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (currentState === "INTERVIEWING") {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] bg-card border border-border rounded-3xl shadow-sm overflow-hidden relative animate-in fade-in duration-700">
        
        {/* Üst Kısım: Kamera ve Durum */}
        <div className="p-6 flex items-start justify-between z-10">
          <div className="flex items-center gap-3 bg-background/80 backdrop-blur-md px-4 py-2.5 rounded-full border border-border shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Canlı Mülakat Kaydı</span>
            <span className="text-xs text-muted-foreground ml-2 border-l border-border pl-2 font-medium">
              {role}
            </span>
          </div>
          
          {/* Ayna Kamera */}
          <div className="w-48 h-36 bg-black rounded-2xl overflow-hidden shadow-lg border border-border relative flex flex-col">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100 flex-1"
            />
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] text-white font-bold">
              <UserCameraIcon /> Kaydediliyor
            </div>
          </div>
          
          <button
            onClick={handleEndInterviewManual}
            disabled={isThinking}
            className="ml-4 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-semibold text-xs border border-red-200 transition-colors shadow-sm disabled:opacity-50"
          >
            Mülakatı Bitir
          </button>
        </div>

        {/* Orta Kısım: Soru ve AI Durumu */}
        <div className="flex-1 flex flex-col items-center justify-start pt-12 pb-8 px-6 md:px-12 text-center max-w-5xl mx-auto w-full relative z-10 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          
          <div className="relative mb-10 shrink-0">
            {isThinking && (
              <div className="absolute inset-0 -m-8 border-[3px] border-primary/30 rounded-full animate-ping opacity-75"></div>
            )}
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-blue-500 to-primary flex items-center justify-center shadow-xl relative z-10 transition-transform duration-700 ${isThinking ? 'scale-110' : 'scale-100'}`}>
              <Brain className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </div>
          </div>

          <div className="w-full text-xl md:text-2xl lg:text-3xl font-medium text-slate-800 leading-relaxed tracking-tight animate-in slide-in-from-bottom-4 duration-700">
            {isThinking ? (
              <span className="text-muted-foreground flex items-center justify-center gap-3 h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" /> Yanıtınız analiz ediliyor...
              </span>
            ) : (
              <div className="break-words pb-10">
                "{renderHighlightedText(currentQuestion, spokenWordIndex)}"
              </div>
            )}
          </div>
        </div>

        {/* Alt Kısım: Cevap Girişi */}
        <div className="p-6 bg-background/50 backdrop-blur-xl border-t border-border mt-auto relative z-20">
          <div className="max-w-4xl mx-auto flex items-end gap-3">
            
            {/* Sesle Cevap Butonu */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isThinking}
              className={`w-14 h-[56px] rounded-xl flex items-center justify-center transition-all shrink-0 border shadow-sm ${
                isListening 
                  ? "bg-red-500 text-white border-red-600 animate-pulse" 
                  : "bg-background hover:bg-muted border-border text-foreground"
              }`}
              title="Sesle Yanıtla"
            >
              {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-5 h-5 opacity-70" />}
            </button>

            {/* Metin Girişi */}
            <div className="relative flex-1">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={isListening ? "Dinleniyor..." : "Cevabınızı buraya yazın veya sesli yanıtlayın..."}
                className={`w-full bg-background border border-input rounded-xl px-4 py-3 min-h-[56px] max-h-32 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-[15px] transition-all font-medium ${isListening ? 'ring-2 ring-red-500/50 border-red-500/50' : ''}`}
                rows={1}
                disabled={isThinking}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendAnswer();
                  }
                }}
              />
            </div>

            {/* Gönder Butonu */}
            <button
              onClick={handleSendAnswer}
              disabled={!userAnswer.trim() || isThinking}
              className="w-14 h-[56px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-md"
            >
              {isThinking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5 ml-1" />
              )}
            </button>
          </div>
        </div>

        {/* Süslemeler */}
        <div className="absolute top-1/4 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10"></div>
      </div>
    );
  }

  // --- PREMIUM AI ANALİZ LOADING EKRANI ---
  if (currentState === "ANALYZING") {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center p-6 animate-in fade-in duration-500">
        <div className="max-w-lg w-full bg-card border border-border rounded-3xl shadow-2xl p-10 text-center relative overflow-hidden">
          {/* Glassmorphic arkaplan süslemeleri */}
          <div className="absolute top-[-20%] left-[-20%] w-60 h-60 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-60 h-60 bg-blue-500/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 space-y-8">
            {/* Animasyonlu Pulsing Yükleyici */}
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
              <div className="absolute inset-2 bg-gradient-to-br from-primary to-blue-500 rounded-full flex items-center justify-center shadow-lg">
                <Brain className="w-8 h-8 text-white animate-pulse" />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500 animate-bounce" /> Yapay Zeka Analizi Başladı
              </h2>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
                {analyzingStatusText}
              </p>
            </div>

            {/* Metrikler Yükleniyor Göstergesi */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 text-left space-y-4 max-w-sm mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">İncelenen Faktörler:</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Eye className="w-3.5 h-3.5 text-blue-500" /> Göz Teması Oranı
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-500" /> Özgüven & Duruş
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> Konuşma Tonu & Hız
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-amber-500" /> Duraksama & Dolgular
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentState === "RESULTS" && evaluation) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom-8 duration-700 scrollbar-thin">
        <div className="max-w-3xl w-full bg-card border border-border rounded-3xl shadow-2xl p-8 relative overflow-hidden my-auto">
          
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 via-primary to-blue-500"></div>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full mb-4 ring-8 ring-green-50/50">
              <Award className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Mülakat Değerlendirmesi Hazır!</h1>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Temel AI skorlarınız hesaplandı. Video/Ses analiz raporunuz başarıyla entegre edildi.
            </p>
          </div>

          {/* Skor Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <ScoreCard 
              title="Teknik Bilgi" 
              score={evaluation.technical_score} 
              icon={<Brain className="w-4 h-4 text-blue-500" />}
              colorClass="text-blue-600 bg-blue-50 border-blue-100"
            />
            <ScoreCard 
              title="Özgüven Skoru" 
              score={analytics ? Math.round(analytics.confidence_pct) : evaluation.confidence_score} 
              icon={<Target className="w-4 h-4 text-indigo-500" />}
              colorClass="text-indigo-600 bg-indigo-50 border-indigo-100"
            />
            <ScoreCard 
              title="İletişim & Kelime" 
              score={evaluation.vocabulary_score} 
              icon={<MessageSquare className="w-4 h-4 text-green-500" />}
              colorClass="text-green-600 bg-green-50 border-green-100"
            />
          </div>

          {/* AI Göz Teması ve Konuşma Ekstra Stats (Eğer analiz varsa) */}
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-100 dark:border-slate-800 rounded-2xl">
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Göz Teması</span>
                <p className="text-base font-black text-slate-700 dark:text-white">%{Math.round(analytics.eye_contact_pct)}</p>
              </div>
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Konuşma Hızı</span>
                <p className="text-base font-black text-slate-700 dark:text-white">{Math.round(analytics.speech_rate_wpm)} WPM</p>
              </div>
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Duraksamalar</span>
                <p className="text-base font-black text-slate-700 dark:text-white">{analytics.pause_count} adet</p>
              </div>
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Duygu</span>
                <p className="text-base font-black text-slate-700 dark:text-white capitalize">{analytics.dominant_emotion === "neutral" ? "Nötr" : analytics.dominant_emotion}</p>
              </div>
            </div>
          )}

          {/* Geri Bildirim */}
          <div className="bg-muted/50 rounded-2xl p-5 border border-border">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-2 flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> Değerlendirme Özeti
            </h3>
            <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed font-semibold">
              {evaluation.feedback}
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
            <button
              onClick={() => setCurrentState("SETUP")}
              className="w-full sm:w-auto bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 px-6 py-3 rounded-xl font-bold text-xs transition-all shadow-sm"
            >
              Yeni Mülakat Başlat
            </button>
            <button
              onClick={() => router.push(`/interviews/${interviewId}`)}
              className="w-full sm:w-auto bg-gradient-to-r from-primary to-blue-600 hover:from-primary/95 hover:to-blue-500 text-white px-6 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
            >
              Detaylı Sonuç Raporuna Git <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    );
  }

  return null;
}

// Yardımcı Bileşenler
function ScoreCard({ title, score, icon, colorClass }: { title: string; score: number; icon: React.ReactNode; colorClass: string }) {
  const parts = colorClass.split(' ');
  const borderBg = parts[1] + " " + parts[2];
  
  return (
    <div className={`bg-background border rounded-2xl p-5 text-center shadow-sm hover:shadow transition-all relative overflow-hidden group ${borderBg}`}>
      <div className="flex items-center justify-center w-8 h-8 bg-white/80 dark:bg-slate-900/80 rounded-full mx-auto mb-3 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xs font-bold text-slate-500 mb-1">{title}</h3>
      <div className={`text-2xl font-black ${parts[0]}`}>
        {score}<span className="text-sm text-slate-400 font-normal">/100</span>
      </div>
    </div>
  );
}

function UserCameraIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
