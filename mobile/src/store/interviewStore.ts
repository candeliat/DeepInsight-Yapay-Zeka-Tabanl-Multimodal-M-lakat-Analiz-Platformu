import { create } from 'zustand';
import { api, API_URL, refreshAccessToken } from '../config/api';
import { getStorageItemAsync } from '../utils/storage';

export interface EvaluationData {
  technical_score: number;
  confidence_score: number;
  vocabulary_score: number;
  feedback: string;
}

/** Mülakatın opsiyonel bağlamı: kişiselleştirme (CV/ilan), kurum (kota, kurum soru bankası,
 * eğitmen görünürlüğü) ve ödev (rol/konu/zorluk ve kurum backend'de ödevden alınır). */
export interface InterviewContext {
  cvId?: string;
  jobId?: string;
  orgId?: string;
  assignmentId?: string;
}

interface InterviewState {
  // Durum
  interviewId: string | null;
  role: string;
  topic: string;
  difficulty: string | null;
  context: InterviewContext;
  currentQuestion: string;
  evaluation: EvaluationData | null;
  
  // Kontroller
  micOn: boolean;
  cameraOn: boolean;
  isThinking: boolean;
  
  // Aksiyonlar
  setRoleTopic: (role: string, topic: string, difficulty?: string | null, context?: InterviewContext) => void;
  startInterview: () => Promise<void>;
  sendMessage: (message: string) => Promise<boolean>; // Bitti mi (true/false) döner
  /** `sendMessage` ile aynı sözleşme, ama soruyu token-token akıtır (currentQuestion
   * her parçada güncellenir — typewriter efekti). SSE'yi XMLHttpRequest ile tüketir
   * (React Native'in fetch+ReadableStream desteği tutarsız olduğu için). */
  sendMessageStream: (message: string) => Promise<boolean>;
  /** Aday, MAX_INTERVIEW_QUESTIONS'a ulaşılmadan mülakatı erken bitirmek istediğinde.
   * Not: LLM'e "bitir" mesajı göndermek işe yaramaz — bitiş sunucu taraflı soru
   * sayacına bağlı, bu yüzden ayrı bir uç nokta (POST /interview/{id}/finish) gerekir. */
  finishInterviewEarly: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => void;
  resetInterview: () => void;
  transcribeAudio: (uri: string) => Promise<string>;
}

export const useInterviewStore = create<InterviewState>((set, get) => ({
  interviewId: null,
  role: 'Yazılım Mühendisi',
  topic: 'Genel',
  difficulty: null,
  context: {},
  currentQuestion: '',
  evaluation: null,

  micOn: true,
  cameraOn: true,
  isThinking: false,

  setRoleTopic: (role, topic, difficulty = null, context = {}) => set({ role, topic, difficulty, context }),

  startInterview: async () => {
    set({ isThinking: true, evaluation: null });
    try {
      const { role, topic, difficulty, context } = get();
      const response = await api.post('/api/v1/interview/start', {
        role,
        topic,
        difficulty: difficulty ?? undefined,
        cv_id: context.cvId,
        job_id: context.jobId,
        org_id: context.orgId,
        assignment_id: context.assignmentId,
      }, { timeout: 90000 });
      
      set({ 
        interviewId: response.data.interview_id,
        currentQuestion: response.data.first_message,
        isThinking: false
      });
    } catch (error) {
      set({ isThinking: false });
      throw error;
    }
  },

  sendMessage: async (message) => {
    set({ isThinking: true });
    try {
      const { interviewId } = get();
      if (!interviewId) throw new Error("Mülakat ID bulunamadı.");

      const response = await api.post('/api/v1/interview/chat', {
        interview_id: interviewId,
        message
      });

      if (response.data.interview_complete && response.data.evaluation) {
        set({ 
          evaluation: response.data.evaluation,
          isThinking: false
        });
        return true; // Mülakat bitti
      } else {
        set({ 
          currentQuestion: response.data.response,
          isThinking: false
        });
        return false; // Devam ediyor
      }
    } catch (error) {
      set({ isThinking: false });
      throw error;
    }
  },

  sendMessageStream: async (message) => {
    // Gönderim başarısız olursa ekrandaki soru geri konur (yoksa kullanıcı neyi cevapladığını göremez).
    const previousQuestion = get().currentQuestion;
    const restoreOnError = (error: unknown): never => {
      if (!get().currentQuestion) set({ currentQuestion: previousQuestion });
      set({ isThinking: false });
      throw error;
    };
    set({ isThinking: true, currentQuestion: '' });
    const { interviewId } = get();
    if (!interviewId) restoreOnError(new Error('Mülakat ID bulunamadı.'));

    const token = await getStorageItemAsync('token');
    try {
      return await streamOnce(interviewId as string, message, token, set);
    } catch (error: any) {
      // XHR axios interceptor'ından geçmez: token mülakat ortasında dolduysa
      // (401) bir kez yenileyip aynı mesajı tekrar gönder. Sunucu 401'de mesajı
      // kaydetmeden döndüğü için tekrar göndermek çift kayıt oluşturmaz.
      if (error?.status !== 401) return restoreOnError(error);
      const fresh = await refreshAccessToken().catch(() => null);
      if (!fresh) return restoreOnError(new Error('Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.'));
      set({ isThinking: true, currentQuestion: '' });
      try {
        return await streamOnce(interviewId as string, message, fresh, set);
      } catch (retryError) {
        return restoreOnError(retryError);
      }
    }
  },

  finishInterviewEarly: async () => {
    set({ isThinking: true });
    try {
      const { interviewId } = get();
      if (!interviewId) throw new Error('Mülakat ID bulunamadı.');

      const response = await api.post(`/api/v1/interview/${interviewId}/finish`);

      set({
        evaluation: response.data.evaluation ?? null,
        isThinking: false,
      });
    } catch (error) {
      set({ isThinking: false });
      throw error;
    }
  },

  toggleMic: () => set((state) => ({ micOn: !state.micOn })),

  toggleCamera: () => set((state) => ({ cameraOn: !state.cameraOn })),

  resetInterview: () => set({
    interviewId: null,
    currentQuestion: '',
    evaluation: null,
    micOn: true,
    cameraOn: true,
    isThinking: false
  }),

  transcribeAudio: async (uri: string) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        name: 'audio.m4a',
        type: 'audio/m4a',
      } as any);

      const response = await api.post('/api/v1/interview/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.text || '';
    } catch (error) {
      throw error;
    }
  }
}));

type SetState = (partial: Partial<InterviewState>) => void;

/** /chat/stream SSE akışını XHR ile tüketir (React Native'in fetch+ReadableStream desteği tutarsız). */
function streamOnce(interviewId: string, message: string, token: string | null, set: SetState): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/v1/interview/chat/stream`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      let processedLength = 0;
      let sseBuffer = '';
      let accumulated = '';
      let settled = false;

      const parseSseBlock = (rawEvent: string) => {
        let eventType = '';
        let dataLine = '';
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
        }
        if (!eventType || !dataLine) return;

        let parsed: any;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          return;
        }

        if (eventType === 'chunk') {
          accumulated += parsed;
          set({ currentQuestion: accumulated, isThinking: false });
        } else if (eventType === 'done') {
          settled = true;
          if (parsed.interview_complete && parsed.evaluation) {
            set({ evaluation: parsed.evaluation, isThinking: false });
            resolve(true);
          } else {
            set({ isThinking: false });
            resolve(false);
          }
        } else if (eventType === 'error') {
          settled = true;
          set({ isThinking: false });
          reject(new Error(parsed.detail || 'Yanıt üretimi sırasında bir hata oluştu.'));
        }
      };

      // XHR'ın o ana kadar aldığı TÜM gövdeyi responseText'te tutması (RN'in
      // networking katmanının davranışı) üzerinden ilerliyoruz: her progress
      // tetiklendiğinde sadece son okumadan bu yana eklenen kısmı işliyoruz.
      const processIncoming = () => {
        const full = xhr.responseText || '';
        if (full.length <= processedLength) return;
        sseBuffer += full.slice(processedLength);
        processedLength = full.length;

        let sepIndex: number;
        while ((sepIndex = sseBuffer.indexOf('\n\n')) !== -1) {
          const rawEvent = sseBuffer.slice(0, sepIndex);
          sseBuffer = sseBuffer.slice(sepIndex + 2);
          parseSseBlock(rawEvent);
        }
      };

      xhr.onprogress = processIncoming;
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          processIncoming();
          if (settled) return;
          set({ isThinking: false });
          if (xhr.status >= 200 && xhr.status < 300) {
            // Akış done/error event'i olmadan bitti — beklenmedik ama en azından
            // arayüzü kilitli bırakmayalım.
            resolve(false);
          } else {
            reject(Object.assign(new Error(`API hatası: HTTP ${xhr.status}`), { status: xhr.status }));
          }
        }
      };
      xhr.onerror = () => {
        if (settled) return;
        set({ isThinking: false });
        reject(new Error('Bağlantı kurulamadı.'));
      };

      xhr.send(JSON.stringify({ interview_id: interviewId, message }));
    });
}
