import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

function Icon({ name, size = 23 }) {
  const paths = {
    arrow: <path d="m15 18-6-6 6-6" />,
    ask: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M9.5 9a2.6 2.6 0 1 1 4.2 2c-.9.6-1.7 1.1-1.7 2M12 16h.01" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    gift: (
      <>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8v13M3 12h18M7.5 8C5 8 4 6.5 4 5.4 4 4 5.1 3 6.4 3 8.5 3 10.3 5.6 12 8M16.5 8C19 8 20 6.5 20 5.4 20 4 18.9 3 17.6 3 15.5 3 13.7 5.6 12 8" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />,
  };
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
      {paths[name]}
    </svg>
  );
}

function loadStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem('pm_priority_streak') || 'null');
    return stored?.lastTaken ? stored : { days: 0, tokens: 0 };
  } catch {
    return { days: 0, tokens: 0 };
  }
}

export default function StreakDetails() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const [streak, setStreak] = useState(loadStreak);
  const days = Math.min(7, Number(streak.days || 0));
  const remaining = Math.max(0, 7 - days);

  useEffect(() => {
    let active = true;
    async function loadServerStreak() {
      try {
        const response = await api('/api/patient/streak/status');
        const next = {
          days: response.data.current_days,
          tokens: response.data.priority_tokens,
          lastTaken: new Date().toISOString(),
        };
        if (!active) return;
        setStreak(next);
        localStorage.setItem('pm_priority_streak', JSON.stringify(next));

        // Opening the reward screen counts as viewing an earned-token notice.
        const notices = await api(
          '/api/patient/notifications?type=reward_earned&unread_only=true&limit=20'
        );
        await Promise.all(
          (notices.data.notifications || []).map((item) =>
            api(`/api/patient/notifications/${item.id}/read`, { method: 'PATCH' })
          )
        );
        window.dispatchEvent(new Event('pm-streak-updated'));
      } catch {
        // The locally cached value remains available when the device is offline.
      }
    }
    loadServerStreak();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="pm-streak-page">
      <header className="pm-streak-page__header">
        <button
          onClick={() => navigate('/patient/today')}
          aria-label={tr('Back to home', 'Bumalik sa home')}
          type="button"
        >
          <Icon name="arrow" />
        </button>
        <h1>{tr('Adherence Streak', 'Adherence Streak')}</h1>
        <span title={tr('How streaks work', 'Paano gumagana ang streak')}>
          <Icon name="info" />
        </span>
      </header>

      <section className="pm-streak-overview" aria-labelledby="streak-overview-title">
        <div className="pm-streak-overview__tokens">
          <span>
            <Icon name="star" size={24} />
          </span>
          <div>
            <small>{tr('Priority Tokens', 'Priority Tokens')}</small>
            <strong>{streak.tokens || 0}</strong>
          </div>
          <Link to="/patient/ask">
            <Icon name="ask" size={20} /> {tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}
          </Link>
        </div>
        <div className="pm-streak-overview__status">
          <div
            className="pm-streak-ring pm-streak-ring--clean"
            style={{ '--streak-progress': `${(days / 7) * 360}deg` }}
          >
            <div>
              <strong>{days}</strong>
              <span>{tr('of 7 days', 'sa 7 araw')}</span>
            </div>
          </div>
          <div>
            <small>{tr('CURRENT STREAK', 'KASALUKUYANG STREAK')}</small>
            <h2 id="streak-overview-title">
              {days === 7
                ? tr('Seven days completed', 'Kumpleto ang pitong araw')
                : tr('Build your healthy routine', 'Buuin ang iyong healthy routine')}
            </h2>
            <p>
              {remaining
                ? tr(
                    `${remaining} ${remaining === 1 ? 'day' : 'days'} remaining until your 7-day reward.`,
                    `${remaining} araw pa bago ang iyong 7-day reward.`
                  )
                : tr('Your final reward has been earned.', 'Nakuha mo na ang final reward.')}
            </p>
          </div>
        </div>
        <div
          className="pm-streak-week pm-streak-week--clean"
          aria-label={`${days} of 7 days completed`}
        >
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
            <span className={i < days ? 'complete' : ''} key={day}>
              <small>{day}</small>
              <b>{i < days ? <Icon name="check" size={16} /> : i + 1}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="pm-streak-rules" aria-labelledby="how-streak-works">
        <header>
          <h2 id="how-streak-works">{tr('How your streak works', 'Paano gumagana ang streak')}</h2>
          <p>
            {tr(
              'A streak shows how many days in a row you completed all your medicines.',
              'Ipinapakita ng streak kung ilang sunod-sunod na araw mong nakumpleto ang lahat ng gamot.'
            )}
          </p>
        </header>
        <div>
          <span>
            <Icon name="calendar" />
          </span>
          <p>
            <strong>
              {tr('1. Take and record every medicine', '1. Inumin at i-record ang bawat gamot')}
            </strong>
            <small>
              {tr(
                'Mark every scheduled dose as taken before the day ends.',
                'Markahan bilang nainom ang bawat naka-iskedyul na dose bago matapos ang araw.'
              )}
            </small>
          </p>
        </div>
        <div className="pm-streak-rule-success">
          <span>
            <Icon name="check" />
          </span>
          <p>
            <strong>
              {tr(
                '2. Your streak increases by one day',
                '2. Madadagdagan ng isang araw ang streak'
              )}
            </strong>
            <small>
              {tr(
                'When all medicines are taken and none are missed, one day is added to your streak.',
                'Kapag nainom ang lahat at walang missed dose, madadagdagan ng isang araw ang iyong streak.'
              )}
            </small>
          </p>
        </div>
        <div className="pm-streak-rule-warning">
          <span>
            <Icon name="shield" />
          </span>
          <p>
            <strong>
              {tr(
                '3. A missed dose breaks the streak',
                '3. Mapuputol ang streak kapag may missed dose'
              )}
            </strong>
            <small>
              {tr(
                'Your current streak returns to zero. You can start a new streak after your next complete day.',
                'Babalik sa zero ang streak. Maaari kang magsimula ulit pagkatapos ng susunod na kumpletong araw.'
              )}
            </small>
          </p>
        </div>
        <div className="pm-streak-rule-reward">
          <span>
            <Icon name="gift" />
          </span>
          <p>
            <strong>
              {tr(
                '4. Longer streaks earn Priority Tokens',
                '4. Ang mas mahabang streak ay nagbibigay ng Priority Tokens'
              )}
            </strong>
            <small>
              {tr(
                'Earn 1 token on Day 3 and Day 6, then 2 tokens on Day 7. Use a token for Priority Chat with a pharmacist.',
                'Makakuha ng 1 token sa Day 3 at Day 6, at 2 token sa Day 7. Gamitin ang token para sa Priority Chat sa parmasyutiko.'
              )}
            </small>
          </p>
        </div>
      </section>

      <section className="pm-streak-reward-path" aria-labelledby="reward-path-title">
        <header>
          <div>
            <Icon name="gift" />
            <span>
              <h2 id="reward-path-title">{tr('Reward progress', 'Reward progress')}</h2>
              <small>{tr(`Day ${days} of 7`, `Araw ${days} sa 7`)}</small>
            </span>
          </div>
          <strong>{days}/7</strong>
        </header>
        <progress max="7" value={days}>
          {days} of 7
        </progress>
        <div className="pm-streak-milestones">
          {[
            { d: 3, t: '1 Token' },
            { d: 6, t: '1 Token' },
            { d: 7, t: '2 Tokens' },
          ].map((step) => (
            <article className={days >= step.d ? 'complete' : ''} key={step.d}>
              <span>
                <Icon name={step.d === 7 ? 'star' : 'shield'} size={20} />
              </span>
              <strong>{tr(`Day ${step.d}`, `Araw ${step.d}`)}</strong>
              <small>{step.t}</small>
            </article>
          ))}
        </div>
        <p>
          {tr(
            'Earn 1 token on Day 3 and Day 6, then 2 tokens for completing Day 7.',
            'Makakuha ng 1 token sa Day 3 at Day 6, at 2 token kapag nakumpleto ang Day 7.'
          )}
        </p>
      </section>

      <aside className="pm-streak-tip pm-streak-tip--clean">
        <Icon name="info" />
        <div>
          <strong>{tr('Helpful reminder', 'Mahalagang paalala')}</strong>
          <p>
            {tr(
              'Log each medicine when you take it so your daily progress stays accurate.',
              'I-log ang bawat gamot kapag ininom upang manatiling tama ang daily progress.'
            )}
          </p>
        </div>
      </aside>
    </main>
  );
}
