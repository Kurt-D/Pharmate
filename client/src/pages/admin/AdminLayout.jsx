import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import pharmateLogo from '../../assets/pharmate-logo-transparent.png';
import '../../styles/admin.css';

// Admin web console (Figs 50–54). Aggregates + pseudonymous management — no
// patient names or conditions anywhere (TC-05).
const MENU = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/users', label: 'User Management', icon: 'users' },
  { to: '/admin/medicines', label: 'Medications', icon: 'medicine' },
  { to: '/admin/orders', label: 'Orders', icon: 'orders' },
  { to: '/admin/alerts', label: 'System Alerts', icon: 'alert' },
  { to: '/admin/settings', label: 'Accessibility', icon: 'settings' },
];

function AdminIcon({ name, size = 19 }) {
  const paths = {
    dashboard: <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" />,
    users: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 6" />
      </>
    ),
    medicine: <path d="M8.5 4.5a4.95 4.95 0 0 1 7 7l-4 4a4.95 4.95 0 0 1-7-7l4-4Zm-2 9 7-7" />,
    orders: (
      <>
        <path d="M3 6h18l-2 13H5L3 6Z" />
        <path d="M8 10h8M9 3h6" />
      </>
    ),
    alert: <path d="M12 3 2.7 20h18.6L12 3Zm0 6v5m0 3h.01" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    moon: <path d="M21 15.2A9 9 0 1 1 8.8 3a7 7 0 0 0 12.2 12.2Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.5 9a2.6 2.6 0 1 1 4.1 2.1c-1 .72-1.6 1.17-1.6 2.4M12 17h.01" />
      </>
    ),
    logout: <path d="M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />,
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
      strokeWidth="1.9"
    >
      {paths[name]}
    </svg>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { preferences, updatePreference } = useAccessibility();
  const current = MENU.find((item) => location.pathname.startsWith(item.to));
  const descriptions = {
    Dashboard: 'Validated system activity from the Pharmate database',
    'User Management': 'Manage role-based accounts without exposing patient names',
    Medications: 'Manage the verified medicine formulary and availability',
    Orders: 'Track refill and delivery requests',
    'System Alerts': 'Monitor adherence, inventory, orders, prescriptions, and accounts',
    Accessibility: 'Adjust text, contrast, motion, and visual comfort across the admin portal',
  };

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`admin-shell${preferences.darkMode ? ' is-dark-mode' : ''}`}>
      <nav className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">
            <img alt="PharMate" src={pharmateLogo} />
          </span>
          <span>
            <strong>PharMate</strong>
            <small>Admin Portal</small>
          </span>
        </div>
        <div className="admin-menu-label">Administrative workspace</div>
        {MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            className={({ isActive }) => 'admin-navlink' + (isActive ? ' active' : '')}
          >
            <AdminIcon name={m.icon} /> <span>{m.label}</span>
          </NavLink>
        ))}
        <div className="admin-preferences">Preferences</div>
        <button
          className="admin-minor"
          onClick={() => updatePreference('darkMode', !preferences.darkMode)}
          type="button"
        >
          <AdminIcon name={preferences.darkMode ? 'sun' : 'moon'} />{' '}
          <span>{preferences.darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button className="admin-minor" type="button">
          <AdminIcon name="help" /> <span>Help</span>
        </button>
        <button className="admin-logout" onClick={handleLogout}>
          <AdminIcon name="logout" /> <span>Log out</span>
        </button>
      </nav>

      <div className="admin-main">
        <header className="admin-header">
          <div>
            <div className="admin-kicker">ADMIN DASHBOARD</div>
            <h1>{current?.label || 'Dashboard'}</h1>
            <div className="admin-sub">
              {descriptions[current?.label] || descriptions.Dashboard}
            </div>
          </div>
          <div className="admin-account">
            <span className="admin-avatar">
              {(user?.name || user?.email || 'Admin').slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{user?.name || user?.email?.split('@')[0] || 'Admin'}</b>
              <small>Administrator</small>
            </span>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
