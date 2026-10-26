import React, { createContext, useContext, useEffect, useState } from 'react';
import { ApiError, authRequest, type User } from '../services/auth';

type Auth = {
  user: User | null; loading: boolean; error: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
};
const Context = createContext<Auth | null>(null);
const key = 'wannarun.auth.token';
function readToken() { try { return sessionStorage.getItem(key); } catch { return null; } }
function storeToken(token: string | null) {
  try { if (token) sessionStorage.setItem(key, token); else sessionStorage.removeItem(key); } catch { /* Memory session still works. */ }
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  function clear() { storeToken(null); setToken(null); setUser(null); }
  useEffect(() => {
    let active = true;
    if (!token) { setLoading(false); return; }
    setLoading(true); setError('');
    authRequest<User>('/users/me', {}, token)
      .then(value => { if (active) setUser(value); })
      .catch(reason => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) clear();
        else setError(reason.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, attempt]);
  async function login(username: string, password: string) {
    const result = await authRequest<{ access_token: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    storeToken(result.access_token); setToken(result.access_token); setError('');
  }
  async function logout() {
    try { await authRequest('/auth/logout', { method: 'POST' }, token || undefined); }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) throw reason; }
    clear(); setError('');
  }
  return <Context.Provider value={{ user, loading, error, login, logout,
    retry: () => setAttempt(value => value + 1) }}>{children}</Context.Provider>;
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AuthProvider가 필요합니다.');
  return context;
}
