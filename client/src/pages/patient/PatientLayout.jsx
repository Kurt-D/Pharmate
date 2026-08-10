import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../../styles/patient.css';
import { api } from '../../api.js';
import { registerPush } from '../../lib/notifications.js';

const NAV = [
  { to: '/patient/home', icon: '🏠', label: 'Home' },
  { to: '/patient/medications', icon: '💊', label: 'Medications' },
  { to: '/patient/ask', icon: '💬', label: 'Ask' },
  { to: '/patient/orders', icon: '🚚', label: 'Orders' },
  { to: '/patient/profile', icon: '👤', label: 'Profile' },
];

export default function PatientLayout() {
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
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
