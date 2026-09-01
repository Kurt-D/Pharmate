import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../config.js';
import { io } from 'socket.io-client';

/** Authenticated SSE connection shared by the existing web and Capacitor builds. */
export function useRealtime(onEvent) {
  const callbackRef = useRef(onEvent);
  const [status, setStatus] = useState(navigator.onLine ? 'connecting' : 'offline');

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let stopped = false;
    let socket = null;
    let controller = null;
    let retryTimer = null;
    let retryMs = 1000;

    async function connectFallback() {
      if (stopped || !navigator.onLine) {
        setStatus('offline');
        return;
      }
      const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
      if (!token) {
        setStatus('offline');
        return;
      }
      setStatus('connecting');
      controller = new AbortController();
      try {
        const response = await fetch(apiUrl('/api/realtime/events'), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Live connection ${response.status}`);
        setStatus('live');
        retryMs = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            if (!block.trim() || block.startsWith(':')) continue;
            const event = block.match(/^event:\s*(.+)$/m)?.[1] || 'message';
            const raw = block.match(/^data:\s*(.+)$/m)?.[1];
            if (!raw) continue;
            try {
              callbackRef.current?.(event, JSON.parse(raw));
            } catch {
              /* Ignore one malformed message without dropping the live connection. */
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError' || stopped) return;
        setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      }
      if (!stopped) {
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 10000);
      }
    }

    function connect() {
      if (stopped || !navigator.onLine) {
        setStatus('offline');
        return;
      }
      const token = sessionStorage.getItem('pm_token') || localStorage.getItem('pm_token');
      if (!token) {
        setStatus('offline');
        return;
      }
      setStatus('connecting');
      socket = io(apiUrl('/') || window.location.origin, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      socket.on('connect', () => setStatus('live'));
      socket.onAny((event, payload) => callbackRef.current?.(event, payload));
      socket.on('disconnect', () => {
        if (!stopped) setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      });
      socket.on('connect_error', () => {
        setStatus(navigator.onLine ? 'reconnecting' : 'offline');
        if (!controller) connectFallback();
      });
    }

    function handleOnline() {
      window.clearTimeout(retryTimer);
      controller?.abort();
      socket?.disconnect();
      retryMs = 1000;
      connect();
    }
    function handleOffline() {
      setStatus('offline');
      controller?.abort();
      socket?.disconnect();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connect();
    return () => {
      stopped = true;
      controller?.abort();
      socket?.disconnect();
      window.clearTimeout(retryTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
