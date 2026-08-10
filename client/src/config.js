/**
 * Backend base URL.
 *
 * The web dev build talks to the API through Vite's dev proxy, so paths stay
 * same-origin ('/api/...') and API_BASE is empty. The native APK has no proxy and
 * loads its assets from the Capacitor scheme, so '/api/...' would resolve against
 * the app itself — it must point at the backend's ABSOLUTE address instead.
 *
 * Set that at build time:  VITE_API_BASE=http://10.15.79.229:3000 npm run build
 * (your PC's LAN IP, reachable from the phone on the same network).
 */
const RAW = (import.meta.env.VITE_API_BASE || '').trim();
export const API_BASE = RAW.replace(/\/+$/, ''); // strip any trailing slash

/** Resolve an app path against the configured backend base. Absolute URLs pass through. */
export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return API_BASE + path;
}
