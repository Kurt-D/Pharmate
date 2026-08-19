import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../../styles/patient.css';
import { api } from '../../api.js';
import { registerPush } from '../../lib/notifications.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const NAV = [
  { to: '/patient/home', icon: '⌂', label: 'nav.home' },
  { to: '/patient/medications', icon: '▣', label: 'nav.medications' },
  { to: '/patient/ask', icon: '▤', label: 'nav.ask' },
  { to: '/patient/orders', icon: '▱', label: 'nav.orders' },
  { to: '/patient/profile', icon: '○', label: 'nav.profile' },
];

export default function PatientLayout() {
  const { t } = useLanguage();
  // Register this device for online FCM reminders once the patient is in the app
  // (no-op on web; on the APK it grabs the token and posts it to the server).
  useEffect(() => {
    registerPush(api);
  }, []);

  return (
    <div className="pm-phone">
      <div className="pm-phone__scroll">
        <Outlet />
      </div>
      <nav className="pm-bottomnav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="pm-navicon">{n.icon}</span>
            <span>{t(n.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
