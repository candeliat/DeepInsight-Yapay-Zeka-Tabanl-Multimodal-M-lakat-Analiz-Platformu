import { create } from 'zustand';
import Cookies from 'js-cookie';
import { api, clearSession, saveSession, setSessionExpiredHandler } from '@/lib/api';

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    first_name?: string;
    last_name?: string;
    [key: string]: any;
  };
  app_metadata: {
    role?: string;
    [key: string]: any;
  };
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  setToken: (token: string, refresh?: string) => void;
  setUser: (user: UserProfile | null) => void;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  initialize: () => Promise<void>;
}

const PROFILE_RETRY_DELAYS_MS = [1000, 2000, 4000];

export const useAuthStore = create<AuthState>((set, get) => ({
  token: Cookies.get('token') || null,
  refreshToken: Cookies.get('refresh_token') || null,
  user: null,
  isLoading: false,

  setToken: (token: string, refresh?: string) => {
    saveSession(token, refresh);
    set({ token, refreshToken: refresh || get().refreshToken });
  },

  setUser: (user: UserProfile | null) => {
    set({ user });
  },

  logout: () => {
    clearSession();
    set({ token: null, refreshToken: null, user: null });
  },

  fetchProfile: async () => {
    if (!Cookies.get('token')) {
      get().logout();
      return;
    }
    set({ isLoading: true });
    try {
      // Token ve 401'de yenileme api.ts interceptor'ında. Oturum gerçekten geçersizse
      // interceptor çerezleri temizler ve store'u sıfırlar (setSessionExpiredHandler).
      // Ağ hatası / 5xx (sunucu yeniden başlıyor, bağlantı koptu) oturumu KAPATMAZ:
      // birkaç kez kısa aralıklarla yeniden denenir.
      for (let attempt = 0; ; attempt++) {
        try {
          const { data } = await api.get('/api/v1/users/me');
          set({ user: data });
          return;
        } catch {
          if (!Cookies.get('token') || attempt >= PROFILE_RETRY_DELAYS_MS.length) return;
          await new Promise((resolve) => setTimeout(resolve, PROFILE_RETRY_DELAYS_MS[attempt]));
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  initialize: async () => {
    const token = Cookies.get('token');
    const refresh = Cookies.get('refresh_token');
    if (token) {
      set({ token, refreshToken: refresh || null });
      await get().fetchProfile();
    }
  }
}));

// Yenileme reddedilince (refresh token geçersiz) store da temizlenir; middleware sonraki
// gezinmede girişe yönlendirir.
setSessionExpiredHandler(() => useAuthStore.setState({ token: null, refreshToken: null, user: null }));
