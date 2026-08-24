/**
 * Tiny fetch wrapper: attaches the bearer token, sends/parses JSON, and throws
 * an Error carrying { status, body } on non-2xx so callers can branch on the
 * three encode outcomes (201 encoded / 202 pending / 403 restricted).
 */
import { apiUrl } from './config.js';

let refreshInFlight = null;

function clearStoredSession() {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem('pm_token');
    storage.removeItem('pm_refresh');
    storage.removeItem('pm_user');
  }
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = sessionStorage.getItem('pm_refresh') || localStorage.getItem('pm_refresh');
  if (!refreshToken) return null;
  refreshInFlight = fetch(apiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      sessionStorage.setItem('pm_token', data.accessToken);
      sessionStorage.setItem('pm_refresh', data.refreshToken);
      return data.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function fetchWithAuthRefresh(path, options = {}, auth = true) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
  if (auth && token) headers.set('Authorization', `Bearer ${token}`);
  let response = await fetch(apiUrl(path), { ...options, headers });
  if (!auth || response.status !== 401 || path === '/api/auth/refresh') return response;

  const renewedToken = await refreshAccessToken();
  if (renewedToken) {
    headers.set('Authorization', `Bearer ${renewedToken}`);
    response = await fetch(apiUrl(path), { ...options, headers });
    return response;
  }

  clearStoredSession();
  if (typeof window !== 'undefined') window.location.replace('/login?reason=session-expired');
  return response;
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetchWithAuthRefresh(
    path,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    auth
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return { status: res.status, data };
}

function authHeaders() {
  const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** POST multipart/form-data (file uploads). Do not set Content-Type — the browser sets the boundary. */
export async function apiUpload(path, formData) {
  const res = await fetchWithAuthRefresh(path, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Upload failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return { status: res.status, data };
}

/** Fetch a protected binary (e.g. the redacted photo) and return an object URL. Revoke it when done. */
export async function apiBlobUrl(path) {
  const res = await fetchWithAuthRefresh(path, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to load (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** Download a protected file (e.g. a CSV export) to disk. */
export async function downloadFile(path, filename) {
  const url = await apiBlobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
