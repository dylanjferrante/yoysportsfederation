import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

export type League = { id: string; name: string; season: string; isCommissioner: boolean; team: { id: string; name: string } | null };
export type User = { id: string; name: string; email: string };

type AuthState = {
  loading: boolean;
  token: string | null;
  user: User | null;
  leagues: League[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(Ctx);

const TOKEN_KEY = 'nf_token';
const USER_KEY = 'nf_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const t = await SecureStore.getItemAsync(TOKEN_KEY);
        const u = await SecureStore.getItemAsync(USER_KEY);
        if (t && u) {
          const saved = JSON.parse(u);
          setToken(t);
          setUser(saved.user);
          setLeagues(saved.leagues ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/mobile/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    setLeagues(data.leagues ?? []);
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify({ user: data.user, leagues: data.leagues }));
  }, []);

  const logout = useCallback(async () => {
    setToken(null); setUser(null); setLeagues([]);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  }, []);

  return <Ctx.Provider value={{ loading, token, user, leagues, login, logout }}>{children}</Ctx.Provider>;
}
