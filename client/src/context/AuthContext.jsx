/* oxlint-disable react/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, apiUrl } from '../config.js';

const AuthContext = createContext(null);
const authenticatedHttp = axios.create({ baseURL: API_BASE || undefined });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      // Refresh tokens are now HttpOnly cookies. Purge any pre-migration token
      // before application code can reuse it.
      sessionStorage.removeItem('pm_refresh');
      localStorage.removeItem('pm_refresh');
      const sessionUser = sessionStorage.getItem('pm_user');
      if (sessionUser) return JSON.parse(sessionUser);
      // One-time migration from the old browser-wide login. Future logins use
      // sessionStorage so patient/caregiver/pharmacist tabs cannot overwrite each other.
      const legacyUser = localStorage.getItem('pm_user');
      if (!legacyUser) return null;
      for (const key of ['pm_user', 'pm_token']) {
        const value = localStorage.getItem(key);
        if (value) sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
      return JSON.parse(legacyUser);
    } catch {
      return null;
    }
  });
  const [restoring, setRestoring] = useState(true);

  const login = useCallback((userData, accessToken, csrfToken) => {
    sessionStorage.setItem('pm_token', accessToken);
    sessionStorage.setItem('pm_csrf', csrfToken);
    sessionStorage.setItem('pm_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  useEffect(() => {
    // A patient who explicitly opted into a trusted session can return without
    // storing a bearer token in localStorage. The HttpOnly refresh cookie is
    // validated and rotated by the server before UI state is restored.
    const csrf = document.cookie.split('; ').find((item) => item.startsWith('pm_csrf='))?.split('=')[1];
    if (!csrf) { setRestoring(false); return; }
    fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf, 'X-Patient-Session-Restore': '1' } })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.user && data?.accessToken) login(data.user, data.accessToken, data.csrfToken); })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [login]);

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
    const csrfToken = sessionStorage.getItem('pm_csrf');
    try {
      if (token) {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrfToken || '' },
        });
      }
    } catch {
      // best-effort
    }
    sessionStorage.removeItem('pm_token');
    sessionStorage.removeItem('pm_csrf');
    sessionStorage.removeItem('pm_user');
    sessionStorage.removeItem('pm_patient_shop_draft');
    sessionStorage.removeItem('pm_prescription_order_draft');
    localStorage.removeItem('pm_token');
    localStorage.removeItem('pm_user');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, restoring }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
