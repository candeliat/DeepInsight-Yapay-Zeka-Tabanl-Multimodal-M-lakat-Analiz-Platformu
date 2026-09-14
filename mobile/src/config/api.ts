import axios from 'axios';
import { getStorageItemAsync } from '../utils/storage';
import { Platform } from 'react-native';

// Eğer uygulamanızı tarayıcıda ("w" tuşuyla) test ediyorsanız localhost çalışır.
// Gerçek telefonda test ediyorsanız (Expo Go okutarak), alttaki IP üzerinden çalışır.
// `export` ediliyor ki interviewStore.ts gibi axios kullanmayan (XHR tabanlı SSE
// akışı için) yerler de aynı base URL'i tekrar tanımlamadan kullanabilsin.
export const API_URL = Platform.OS === 'web' ? 'http://localhost:8000' : 'http://10.192.16.105:8000';

// Eğer fiziksel bir cihazda Wi-Fi üzerinden bağlanıyorsanız, bu IP'nizin (örn: 192.168.1.x) 
// olması gerekir. Ancak kullanıcı talebine göre NextJS'in çalıştığı IP'ye sabitlendi.

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Güvenli Store'daki (Expo) JWT token'ını her isteğe enjekte eden Interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getStorageItemAsync('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // SecureStore okunamadıysa token'sız devam et
    }
    return config;
  },
  (error) => Promise.reject(error)
);
