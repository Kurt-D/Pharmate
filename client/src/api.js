/**
 * Tiny fetch wrapper: attaches the bearer token, sends/parses JSON, and throws
 * an Error carrying { status, body } on non-2xx so callers can branch on the
 * three encode outcomes (201 encoded / 202 pending / 403 restricted).
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = localStorage.getItem('pm_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
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
