import { create } from 'zustand';
import { api } from '../config/api';

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
