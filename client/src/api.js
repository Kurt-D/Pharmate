/**
 * Tiny fetch wrapper: attaches the bearer token, sends/parses JSON, and throws
 * an Error carrying { status, body } on non-2xx so callers can branch on the
 * three encode outcomes (201 encoded / 202 pending / 403 restricted).
 */
import { apiUrl } from './config.js';

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = localStorage.getItem('pm_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
  const token = localStorage.getItem('pm_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** POST multipart/form-data (file uploads). Do not set Content-Type — the browser sets the boundary. */
export async function apiUpload(path, formData) {
  const res = await fetch(apiUrl(path), { method: 'POST', headers: authHeaders(), body: formData });
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
  const res = await fetch(apiUrl(path), { headers: authHeaders() });
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
