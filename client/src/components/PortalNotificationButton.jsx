import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useRealtime } from '../hooks/useRealtime.js';

export default function PortalNotificationButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/notifications?limit=30');
      setItems(response.data.notifications);
      setUnread(response.data.unread_count);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const focus = () => load().catch(() => {});
    window.addEventListener('focus', focus);
    const timer = window.setInterval(focus, 30000);
    return () => {
      window.removeEventListener('focus', focus);
      window.clearInterval(timer);
    };
  }, [load]);

  useRealtime((event) => {
    if (event === 'NOTIFICATION_CREATED' || event === 'CAREGIVER_LINK_UPDATED') {
      load().catch(() => {});
    }
  });

  async function read(item) {
    if (!item.read_at) {
      await api(`/api/notifications/${item.id}/read`, { method: 'PATCH' });
      setItems((all) =>
        all.map((entry) =>
          entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry
        )
      );
      setUnread((value) => Math.max(0, value - 1));
    }
    if (item.action_path) navigate(item.action_path);
    setOpen(false);
  }

  async function readAll() {
    await api('/api/notifications/read-all', { method: 'POST' });
    setItems((all) =>
      all.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
    );
    setUnread(0);
  }

  return (
    <div className="portal-notification-center">
      <button
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="portal-notification-bell"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bell />
        {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
      </button>
      {open && (
        <section className="portal-notification-drawer" aria-label="Notifications">
          <header>
            <div>
              <strong>Notifications</strong>
              <small>{unread} unread</small>
            </div>
            <button aria-label="Close notifications" onClick={() => setOpen(false)}>
              <X />
            </button>
          </header>
          {unread > 0 && (
            <button className="portal-notification-readall" disabled={loading} onClick={readAll}>
              <CheckCheck /> Mark all as read
            </button>
          )}
          <div className="portal-notification-list">
            {loading && !items.length && <p>Loading notifications…</p>}
            {!loading && !items.length && <p>No notifications yet.</p>}
            {items.map((item) => (
              <button
                className={item.read_at ? '' : 'is-unread'}
                key={item.id}
                onClick={() => read(item)}
              >
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <time>{new Date(item.created_at).toLocaleString()}</time>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
