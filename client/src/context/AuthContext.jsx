/* oxlint-disable react/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, apiUrl } from '../config.js';

const AuthContext = createContext(null);
const authenticatedHttp = axios.create({ baseURL: API_BASE || undefined });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const sessionUser = sessionStorage.getItem('pm_user');
      if (sessionUser) return JSON.parse(sessionUser);
      // One-time migration from the old browser-wide login. Future logins use
      // sessionStorage so patient/caregiver/pharmacist tabs cannot overwrite each other.
      const legacyUser = localStorage.getItem('pm_user');
      if (!legacyUser) return null;
      for (const key of ['pm_user', 'pm_token', 'pm_refresh']) {
        const value = localStorage.getItem(key);
        if (value) sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
      return JSON.parse(legacyUser);
    } catch {
      return null;
    }
  });

  const login = useCallback((userData, accessToken, refreshToken) => {
    sessionStorage.setItem('pm_token', accessToken);
    sessionStorage.setItem('pm_refresh', refreshToken);
    sessionStorage.setItem('pm_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  useEffect(() => {
    const interceptor = authenticatedHttp.interceptors.request.use((config) => {
      const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => authenticatedHttp.interceptors.request.eject(interceptor);
  }, []);

  const logout = useCallback(async () => {
    const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
    const refresh = sessionStorage.getItem('pm_refresh') || localStorage.getItem('pm_refresh');
    try {
      if (token) {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
      }
    } catch {
      // best-effort
    }
    sessionStorage.removeItem('pm_token');
    sessionStorage.removeItem('pm_refresh');
    sessionStorage.removeItem('pm_user');
    localStorage.removeItem('pm_token');
    localStorage.removeItem('pm_refresh');
    localStorage.removeItem('pm_user');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
