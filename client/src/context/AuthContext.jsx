import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pm_user')) ?? null;
    } catch {
      return null;
    }
  });

  const login = useCallback((userData, accessToken, refreshToken) => {
    localStorage.setItem('pm_token', accessToken);
    localStorage.setItem('pm_refresh', refreshToken);
    localStorage.setItem('pm_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem('pm_token');
    const refresh = localStorage.getItem('pm_refresh');
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
      }
    } catch {
      // best-effort
    }
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
