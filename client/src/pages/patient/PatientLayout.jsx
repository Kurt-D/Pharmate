import { NavLink, Outlet } from 'react-router-dom';
import '../../styles/patient.css';

const NAV = [
  { to: '/patient/home', icon: '🏠', label: 'Home' },
  { to: '/patient/medications', icon: '💊', label: 'Medications' },
  { to: '/patient/ask', icon: '💬', label: 'Ask' },
  { to: '/patient/orders', icon: '🚚', label: 'Orders' },
  { to: '/patient/profile', icon: '👤', label: 'Profile' },
];

export default function PatientLayout() {
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
