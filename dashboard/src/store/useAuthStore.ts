import { create } from 'zustand';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    first_name?: string;
    last_name?: string;
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
  refreshAccessToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: Cookies.get('token') || null,
  refreshToken: Cookies.get('refresh_token') || null,
  user: null,
  isLoading: false,

  setToken: (token: string, refresh?: string) => {
    Cookies.set('token', token, { expires: 7 });
    if (refresh) Cookies.set('refresh_token', refresh, { expires: 30 });
    set({ token, refreshToken: refresh || get().refreshToken });
  },

  setUser: (user: UserProfile | null) => {
    set({ user });
  },

  logout: () => {
    Cookies.remove('token');
    Cookies.remove('refresh_token');
    set({ token: null, refreshToken: null, user: null });
  },

  refreshAccessToken: async (): Promise<boolean> => {
    const refresh = get().refreshToken;
    if (!refresh) return false;
    try {
      const { data } = await api.post('/api/v1/auth/refresh', { refresh_token: refresh });
      if (data.access_token) {
        get().setToken(data.access_token, data.refresh_token || refresh);
        return true;
      }
      return false;
    } catch {
      get().logout();
      return false;
    }
  },

  fetchProfile: async () => {
    try {
      set({ isLoading: true });
      const token = get().token || Cookies.get('token');
      if (!token) { get().logout(); return; }
      const { data } = await api.get('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ user: data });
    } catch (error: any) {
      if (error.response?.status === 401) {
        const refreshed = await get().refreshAccessToken();
        if (refreshed) {
          await get().fetchProfile();
          return;
        }
      }
      get().logout();
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
