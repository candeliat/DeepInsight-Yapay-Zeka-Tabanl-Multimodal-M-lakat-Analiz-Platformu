import { create } from 'zustand';
import { setStorageItemAsync, getStorageItemAsync, deleteStorageItemAsync } from '../utils/storage';
import { api } from '../config/api';

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    first_name?: string;
    last_name?: string;
    target?: string;
    [key: string]: any;
  };
}

interface UserState {
  user: UserProfile | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setToken: (token: string, refresh?: string) => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  logout: () => Promise<void>;
  fetchProfile: (tokenOverride?: string) => Promise<void>;
  initialize: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

/**
 * Kullanıcı kimlik doğrulama yönetimini (Global State) barındırır.
 * SecureStore / LocalStorage ile JWT token persist (kalıcı) edilir.
 */
export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  
  setToken: async (token: string, refresh?: string) => {
    await setStorageItemAsync('token', token);
    if (refresh) await setStorageItemAsync('refresh_token', refresh);
    set({ token, refreshToken: refresh || get().refreshToken, isAuthenticated: true });
  },
  
  setUser: (user: UserProfile | null) => {
    set({ user });
  },

  logout: async () => {
    await deleteStorageItemAsync('token');
    await deleteStorageItemAsync('refresh_token');
    set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
  },

  refreshAccessToken: async (): Promise<boolean> => {
    const refresh = get().refreshToken;
    if (!refresh) return false;
    try {
      const { data } = await api.post('/api/v1/auth/refresh', { refresh_token: refresh });
      if (data.access_token) {
        await get().setToken(data.access_token, data.refresh_token || refresh);
        return true;
      }
      return false;
    } catch {
      await get().logout();
      return false;
    }
  },

  fetchProfile: async (tokenOverride?: string) => {
    try {
      set({ isLoading: true });
      const tokenToUse = tokenOverride || get().token;
      const { data } = await api.get('/api/v1/users/me', {
        headers: tokenToUse ? { Authorization: `Bearer ${tokenToUse}` } : {},
      });
      set({ user: data, isAuthenticated: true });
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
    try {
      const token = await getStorageItemAsync('token');
      const refresh = await getStorageItemAsync('refresh_token');
      if (token) {
        set({ token, refreshToken: refresh || null });
        await get().fetchProfile(token);
      }
    } catch {
      // Başlangıç hatası — kullanıcı giriş ekranına yönlendirilir
    }
  }
}));
