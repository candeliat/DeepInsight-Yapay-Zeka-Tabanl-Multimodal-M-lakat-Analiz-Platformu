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

// Supabase erişim token'ı ~1 saatte doluyor. Eskiden ilk 401'de token siliniyor
// ve kullanıcı saatte bir sistemden atılıyordu; artık önce refresh token ile bir
// kez yenilenip istek tekrarlanır. Aynı anda gelen 401'ler tek bir yenileme
// isteğini paylaşır (yarış durumunda refresh token'ın iki kez harcanmasını önler).
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = Cookies.get('refresh_token');
  if (!refresh) return null;
  try {
    // Düz axios: bu çağrı interceptor'a girip kendini tekrar tetiklemesin.
    const { data } = await axios.post(`${baseURL}/api/v1/auth/refresh`, { refresh_token: refresh });
    if (!data?.access_token) return null;
    Cookies.set('token', data.access_token, { expires: 7 });
    if (data.refresh_token) Cookies.set('refresh_token', data.refresh_token, { expires: 30 });
    return data.access_token;
  } catch {
    return null;
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.includes('/api/v1/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }

    if (error.response?.status === 401) {
      Cookies.remove('token');
    }
    return Promise.reject(error);
  }
);
