import { api } from '../config/api';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { getStorageItemAsync } from '../utils/storage';

export const analyticsService = {
  /**
   * Videoyu parçalar halinde veya multipart-form data ile backend'e yükler.
   */
  async uploadRecording(
    interviewId: string, 
    fileUri: string, 
    onProgress?: (progressEvent: any) => void
  ) {
    try {
      const formData = new FormData();
      
      // Expo Camera'dan gelen dosya genellikle mp4 veya mov olur.
      const filename = fileUri.split('/').pop() || `interview_${interviewId}.mp4`;
      const type = filename.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

      formData.append('file', {
        uri: Platform.OS === 'ios' ? fileUri.replace('file://', '') : fileUri,
        name: filename,
        type: type,
      } as any);

      const token = await getStorageItemAsync('token');
      const headers: Record<string, string> = {
        'Content-Type': 'multipart/form-data',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await api.post(`/api/v1/analytics/analyze/${interviewId}`, formData, {
        headers,
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            onProgress(progressEvent);
          }
        },
      });
      
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Video yüklenirken hata oluştu.');
    }
  },

  /**
   * AI Analiz sonucunun hazır olup olmadığını sorgular.
   */
  async getAnalysisStatus(interviewId: string) {
    try {
      const token = await getStorageItemAsync('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await api.get(`/api/v1/analytics/status/${interviewId}`, {
        headers,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Durum sorgulanamadı.');
    }
  },

  /**
   * Tamamlanmış AI analiz metriklerini getirir.
   */
  async getAnalysisResults(interviewId: string) {
    try {
      const token = await getStorageItemAsync('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await api.get(`/api/v1/analytics/results/${interviewId}`, {
        headers,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Sonuçlar alınamadı.');
    }
  }
};
