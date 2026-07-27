import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/pharmacist.css';

const MENU = [
  { to: '/pharmacist/dashboard', label: 'Dashboard' },
  { to: '/pharmacist/curation', label: 'Drug Curation' },
  { to: '/pharmacist/validation', label: 'Prescription Verification' },
  { to: '/pharmacist/inquiries', label: 'Inquiries' },
  { to: '/pharmacist/patients', label: 'Patients' },
];

export default function PharmacistLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
            <h1>Pharmacist Console</h1>
            <div className="pw-sub">Manage the medicine database and validations.</div>
          </div>
          <div className="text-end">
            <div className="fw-semibold">{user?.id ? 'Pharmacist' : ''}</div>
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
