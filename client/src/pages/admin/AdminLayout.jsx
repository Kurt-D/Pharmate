import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/admin.css';

// Admin web console (Figs 50–54). Aggregates + pseudonymous management — no
// patient names or conditions anywhere (TC-05).
const MENU = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/users', label: 'User Management' },
  { to: '/admin/medicines', label: 'Medications' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/priority', label: 'Priority Access' },
  { to: '/admin/alerts', label: 'Alerts' },
  { to: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const current = MENU.find((item) => location.pathname.startsWith(item.to));
  const descriptions = {
    Dashboard: 'Validated system activity from the Pharmate database',
    'User Management': 'Manage role-based accounts without exposing patient names',
    Medications: 'Manage the verified medicine formulary and availability',
    Orders: 'Track refill and delivery requests',
    'Priority Access': 'Pharmacist-validated priority access summary',
    Alerts: 'Review missed-dose alerts and follow-up status',
    Reports: 'Analyze system performance and export validated records',
  };

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">P</span>
          <span>HAR</span>
          <b>MATE</b>
        </div>
        <div className="admin-menu-label">MENU</div>
        {MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            className={({ isActive }) => 'admin-navlink' + (isActive ? ' active' : '')}
          >
            {m.label}
          </NavLink>
        ))}
        <div className="admin-preferences">PREFERENCES</div>
        <button className="admin-minor" type="button">
          Settings
        </button>
        <button className="admin-minor" type="button">
          Help
        </button>
        <button className="admin-logout" onClick={handleLogout}>
          ⇥ &nbsp; Log out
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
            <span className="admin-avatar">A</span>
            <span>
              <b>Admin</b>
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
