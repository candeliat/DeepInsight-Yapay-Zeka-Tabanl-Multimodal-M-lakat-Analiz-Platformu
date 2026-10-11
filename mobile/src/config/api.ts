import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { deleteStorageItemAsync, getStorageItemAsync, setStorageItemAsync } from '../utils/storage';

// API adresi ortam değişkeninden okunur (mobile/.env -> EXPO_PUBLIC_API_URL=http://192.168.1.20:8000).
// Tanımlı değilse: web'de localhost, cihazda geliştiricinin yerel ağ IP'si (Expo Go için
// bilgisayarın IP'si olmalı — telefon "localhost"a ulaşamaz).
const DEFAULT_API_URL = Platform.OS === 'web' ? 'http://localhost:8000' : 'http://10.192.16.105:8000';

// `export` ediliyor ki interviewStore.ts gibi axios kullanmayan (XHR tabanlı SSE
// akışı için) yerler de aynı base URL'i tekrar tanımlamadan kullanabilsin.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

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
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // SecureStore okunamadıysa token'sız devam et
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Oturum yenileme ---------------------------------------------------------
// Access token ~1 saatte dolar. 401 gelince refresh token ile bir kez yenilenir ve
// istek tekrarlanır. Aynı anda düşen birden çok istek TEK bir yenileme isteğini paylaşır.
// Yenileme gerçekten reddedilirse (refresh token geçersiz) oturum kapatılır; ağ hatası ya
// da 503 (kimlik servisine ulaşılamadı) oturumu KAPATMAZ — geçici sorun kullanıcıyı atmamalı.

let onSessionExpired: (() => void) | null = null;
/** userStore kaydeder (döngüsel import olmasın diye api.ts store'u import etmez). */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

let refreshing: Promise<string | null> | null = null;

/** Yeni access token döner; refresh token geçersizse null. Ağ hatasında hata fırlatır. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = await getStorageItemAsync('refresh_token');
      if (!refresh) return null;
      try {
        // Interceptor döngüsüne girmemek için yalın axios.
        const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: refresh });
        if (!data?.access_token) return null;
        await setStorageItemAsync('token', data.access_token);
        if (data.refresh_token) await setStorageItemAsync('refresh_token', data.refresh_token);
        return data.access_token as string;
      } catch (error) {
        if ((error as AxiosError).response?.status === 401) return null;
        throw error; // ağ hatası / 5xx: oturum korunur
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes('/api/v1/auth/');
    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      return Promise.reject(error);
    }
    original._retried = true;
    let token: string | null;
    try {
      token = await refreshAccessToken();
    } catch {
      return Promise.reject(error);
    }
    if (!token) {
      await deleteStorageItemAsync('token');
      await deleteStorageItemAsync('refresh_token');
      onSessionExpired?.();
      return Promise.reject(error);
    }
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  }
);

/** Backend hata gövdesinden kullanıcıya gösterilecek Türkçe mesaj. */
export function errorMessage(error: unknown, fallback = 'Bir hata oluştu.'): string {
  const e = error as AxiosError<{ detail?: unknown }>;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if (e?.message === 'Network Error') return 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.';
  return fallback;
}
