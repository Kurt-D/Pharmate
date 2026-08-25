import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

function Icon({ name, size = 22 }) {
  const path =
    name === 'back' ? (
      <path d="m15 18-6-6 6-6" />
    ) : (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    );
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
    >
      {path}
    </svg>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const [items, setItems] = useState(null);

  useEffect(() => {
    api('/api/patient/notifications?limit=30')
      .then((response) => setItems(response.data.notifications))
      .catch(() => setItems([]));
  }, []);

  async function markAllRead() {
    try {
      await api('/api/patient/notifications/read-all', { method: 'POST' });
    } finally {
      setItems((all) =>
        (all || []).map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
      );
    }
  }

  return (
    <main className="pm-notifications-page">
      <header>
        <button onClick={() => navigate(-1)} aria-label={tr('Go back', 'Bumalik')} type="button">
          <Icon name="back" />
        </button>
        <div>
          <h1>{tr('Notifications', 'Mga Abiso')}</h1>
          <p>
            {tr(
              'Medicine reminders and important account updates.',
              'Mga paalala sa gamot at mahahalagang update.'
            )}
          </p>
        </div>
      </header>
      {items?.some((item) => !item.read_at) && (
        <button className="pm-mark-read-button" onClick={markAllRead} type="button">
          {tr('Mark all as read', 'Markahang nabasa lahat')}
        </button>
      )}
      {items === null ? (
        <div className="pm-notification-empty">
          {tr('Loading notifications…', 'Nilo-load ang mga abiso…')}
        </div>
      ) : items.length ? (
        <section className="pm-notification-list">
          {items.map((item) => (
            <article className={item.read_at ? '' : 'unread'} key={item.id}>
              <span>
                <Icon name="bell" />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <time>{new Date(item.created_at).toLocaleString()}</time>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="pm-notification-empty">
          <span>
            <Icon name="bell" size={32} />
          </span>
          <h2>{tr('No notifications yet', 'Wala pang abiso')}</h2>
          <p>
            {tr(
              'Your medicine reminders and updates will appear here.',
              'Lalabas dito ang iyong mga paalala at update.'
            )}
          </p>
        </div>
      )}
    </main>
  );
}
