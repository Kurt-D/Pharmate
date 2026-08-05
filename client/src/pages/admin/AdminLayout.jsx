import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/pharmacist.css';

// Admin web console (Figs 50–54). Aggregates + pseudonymous management — no
// patient names or conditions anywhere (TC-05).
const MENU = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/users', label: 'User Management' },
  { to: '/admin/medicines', label: 'Medications' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/priority', label: 'Priority' },
  { to: '/admin/alerts', label: 'Alerts' },
  { to: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="pw-shell">
      <nav className="pw-sidebar">
        <div className="pw-brand">
          P<span>harMate</span>
        </div>
        <div className="pw-menu-label">MENU</div>
        {MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            className={({ isActive }) => 'pw-navlink' + (isActive ? ' active' : '')}
          >
            {m.label}
          </NavLink>
        ))}
        <button className="pw-logout" onClick={handleLogout}>
          Log out
        </button>
      </nav>

      <div className="pw-main">
        <header className="pw-header">
          <div>
            <h1>Admin Console</h1>
            <div className="pw-sub">Aggregates only — no individual names or conditions.</div>
          </div>
          <div className="text-end">
            <div className="fw-semibold">Admin</div>
            <div className="pw-sub">Signed in</div>
          </div>
        </header>
        <div className="pw-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
