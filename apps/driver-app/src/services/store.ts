import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { SessionData, ChargerData } from './api';

interface AuthState {
  token: string | null;
  setToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: async (token) => {
    await SecureStore.setItemAsync('auth_token', token);
    set({ token });
  },
  clearToken: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    set({ token: null });
  },
}));

interface SessionState {
  activeSession: SessionData | null;
  setActiveSession: (s: SessionData | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  setActiveSession: (activeSession) => set({ activeSession }),
}));

interface WalletState {
  balance: number;
  currency: string;
  setWallet: (balance: number, currency: string) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: 0,
  currency: 'LKR',
  setWallet: (balance, currency) => set({ balance, currency }),
}));
