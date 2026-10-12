import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create a configured Axios instance
export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject the JWT token automatically
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Oturum çerezleri tek yerden yazılır. sameSite=lax: başka sitelerden gelen isteklere
// eklenmez; secure: sayfa HTTPS üzerinden sunuluyorsa yalnızca HTTPS'te gönderilir.
const cookieOptions = (days: number): Cookies.CookieAttributes => ({
  expires: days,
  sameSite: 'lax',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
});

export function saveSession(token: string, refresh?: string | null) {
  Cookies.set('token', token, cookieOptions(7));
  if (refresh) Cookies.set('refresh_token', refresh, cookieOptions(30));
}

export function clearSession() {
  Cookies.remove('token');
  Cookies.remove('refresh_token');
}

// Oturum gerçekten geçersizleşince (refresh token reddedildi) store'u haberdar eder.
// api.ts store'u import etmez (döngüsel import olmasın diye); store kendini kaydeder.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

/**
 * Supabase erişim token'ı ~1 saatte dolar; 401'de refresh token ile bir kez yenilenip
 * istek tekrarlanır. Aynı anda gelen 401'ler tek bir yenileme isteğini paylaşır
 * (refresh token'ın iki kez harcanmasını önler).
 *
 * Dönüş: yeni token, ya da refresh token yok/reddedildiyse null. Ağ hatası ya da 5xx
 * (kimlik servisine ulaşılamadı) durumunda HATA FIRLATIR: geçici bir sorun kullanıcıyı
 * oturumdan atmamalı (önceden ağ hatası da "geçersiz" sayılıp çıkış yapılıyordu).
 */
let refreshInFlight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    const refresh = Cookies.get('refresh_token');
    if (!refresh) return null;
    try {
      // Düz axios: bu çağrı interceptor'a girip kendini tekrar tetiklemesin.
      const { data } = await axios.post(`${baseURL}/api/v1/auth/refresh`, { refresh_token: refresh });
      if (!data?.access_token) return null;
      saveSession(data.access_token, data.refresh_token);
      return data.access_token as string;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      if (status === 400 || status === 401) return null; // refresh token geçersiz/süresi dolmuş
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.includes('/api/v1/auth/');
    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      return Promise.reject(error);
    }
    original._retried = true;
    let newToken: string | null;
    try {
      newToken = await refreshAccessToken();
    } catch {
      return Promise.reject(error); // geçici hata: oturum korunur
    }
    if (!newToken) {
      clearSession();
      onSessionExpired?.();
      return Promise.reject(error);
    }
    original.headers.Authorization = `Bearer ${newToken}`;
    return api(original);
  }
);
