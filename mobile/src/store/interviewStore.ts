import { create } from 'zustand';
import { api, API_URL } from '../config/api';
import { getStorageItemAsync } from '../utils/storage';

export interface EvaluationData {
  technical_score: number;
  confidence_score: number;
  vocabulary_score: number;
  feedback: string;
}

interface InterviewState {
  // Durum
  interviewId: string | null;
  role: string;
  topic: string;
  currentQuestion: string;
  evaluation: EvaluationData | null;
  
  // Kontroller
  micOn: boolean;
  cameraOn: boolean;
  isThinking: boolean;
  
  // Aksiyonlar
  setRoleTopic: (role: string, topic: string) => void;
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
  currentQuestion: '',
  evaluation: null,
  
  micOn: true,
  cameraOn: true,
  isThinking: false,

  setRoleTopic: (role, topic) => set({ role, topic }),

  startInterview: async () => {
    set({ isThinking: true, evaluation: null });
    try {
      const { role, topic } = get();
      const response = await api.post('/api/v1/interview/start', {
        role,
        topic
      });
      
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
    set({ isThinking: true, currentQuestion: '' });
    const { interviewId } = get();
    if (!interviewId) {
      set({ isThinking: false });
      throw new Error('Mülakat ID bulunamadı.');
    }

    const token = await getStorageItemAsync('token');

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
            reject(new Error(`API hatası: HTTP ${xhr.status}`));
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
