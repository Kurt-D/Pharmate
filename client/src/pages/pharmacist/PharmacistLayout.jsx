import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/pharmacist.css';
import '../../styles/pharmacist-redesign.css';
import '../../styles/pharmacist-workspace.css';
import pharmateLogo from '../../assets/pharmate-logo-transparent.png';
import PortalNotificationButton from '../../components/PortalNotificationButton.jsx';

const MENU = [
  { to: '/pharmacist/dashboard', label: 'Dashboard' },
  { to: '/pharmacist/patients', label: 'Patients' },
  { to: '/pharmacist/inquiries', label: 'Inquiries' },
  { to: '/pharmacist/appointments', label: 'Appointments' },
  { to: '/pharmacist/validation', label: 'Prescription Verification' },
  { to: '/pharmacist/medicine-rules', label: 'Medicine Rules & Safety' },
  { to: '/pharmacist/alerts', label: 'Alerts' },
];
const TITLES = {
  dashboard: ['Dashboard', 'Manage medicine operations efficiently'],
  patients: ['Patients', 'Manage linked patient records'],
  inquiries: ['Counseling', 'Manage and communicate with patients'],
  appointments: [
    'Appointments & Counseling',
    'Schedule follow-ups and review post-dispensing summaries',
  ],
  validation: [
    'Prescription Verification',
    'Review and verify prescriptions before dispensing medications.',
  ],
  alerts: ['Alerts', 'Manage medication and inquiry alerts'],
  orders: ['Orders', 'Manage refill and delivery requests'],
  curation: ['Drug Database', 'Review and curate medicine records'],
  'medicine-rules': [
    'Medicine Rules & Safety',
    'Review medicine evidence, safety checks, and rule versions',
  ],
};

export default function PharmacistLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const page = location.pathname.split('/').pop();
  const title = TITLES[page] || ['Pharmacist Console', 'Manage pharmacy operations'];
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (page === 'dashboard') return <Outlet />;

  return (
    <div className="pw-shell pw-workspace">
      <nav className="pw-sidebar" aria-label="Pharmacist navigation">
        <div className="pw-brand">
          <img src={pharmateLogo} alt="PharMate" />
          <small>Pharmacist portal</small>
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
        <div className="pw-menu-label pw-operations-label">OPERATIONS</div>
        <NavLink
          to="/pharmacist/orders"
          className={({ isActive }) => 'pw-navlink' + (isActive ? ' active' : '')}
        >
          Orders
        </NavLink>
        <NavLink
          to="/pharmacist/curation"
          className={({ isActive }) => 'pw-navlink' + (isActive ? ' active' : '')}
        >
          Drug Database
        </NavLink>
        <button className="pw-logout" onClick={handleLogout}>
          Log out
        </button>
      </nav>

      <div className="pw-main">
        <header className="pw-header">
          <div>
            <h1>{title[0]}</h1>
            <div className="pw-sub">{title[1]}</div>
          </div>
          <div className="text-end">
            <PortalNotificationButton />
            <div className="pw-user-badge">
              <i aria-hidden="true">Rx</i>
              <span>
                <strong>{user?.full_name || user?.email || 'Pharmacist'}</strong>
                <small>Pharmacist</small>
              </span>
            </div>
          </div>
        </header>
        <div className="pw-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
