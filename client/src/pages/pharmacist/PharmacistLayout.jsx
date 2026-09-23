import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  ClipboardCheck,
  LayoutDashboard,
  MessageCircleMore,
  PackageCheck,
  Pill,
  Settings,
  History,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import '../../styles/pharmacist.css';
import '../../styles/pharmacist-redesign.css';
import '../../styles/pharmacist-workspace.css';
import '../../styles/pharmacist-modern.css';
import pharmateLogo from '../../assets/pharmate-logo.png';
import PortalNotificationButton from '../../components/PortalNotificationButton.jsx';

const NAVIGATION_SECTIONS = [
  {
    label: 'Clinical workspace',
    items: [
      { to: '/pharmacist/dashboard', label: 'Overview', icon: LayoutDashboard },
      { to: '/pharmacist/inquiries', label: 'Medication Inquiries', icon: MessageCircleMore },
      { to: '/pharmacist/validation', label: 'Prescription Validation', icon: ClipboardCheck },
      { to: '/pharmacist/patient-care', label: 'Patient Care', icon: UsersRound },
    ],
  },
  {
    label: 'Formulary & service',
    items: [
      { to: '/pharmacist/curation', label: 'Clinical Drug Review', icon: Pill },
      { to: '/pharmacist/medicine-rules', label: 'Medicine Rules & Safety', icon: ShieldCheck },
      { to: '/pharmacist/orders', label: 'Orders', icon: PackageCheck },
      { to: '/pharmacist/history', label: 'History', icon: History },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { to: '/pharmacist/settings', label: 'Settings', icon: Settings },
    ],
  },
];
const TITLES = {
  dashboard: ['Dashboard', 'Manage medicine operations efficiently'],
  'patient-care': ['Patient Care', 'Manage patients, follow-ups, alerts, and counseling appointments'],
  patients: ['Patient Care', 'Manage patients, follow-ups, alerts, and counseling appointments'],
  inquiries: ['Counseling', 'Manage and communicate with patients'],
  appointments: ['Patient Care', 'Manage patients, follow-ups, alerts, and counseling appointments'],
  validation: [
    'Prescription Verification',
    'Review and verify prescriptions before dispensing medications.',
  ],
  alerts: ['Patient Care', 'Manage patients, follow-ups, alerts, and counseling appointments'],
  orders: ['Orders', 'Manage refill and delivery requests'],
  curation: ['Clinical Drug Review', 'Review medicines awaiting catalog approval and manage the shared medicine catalog'],
  'medicine-rules': ['Medicine Rules & Safety', 'Review clinical evidence, scheduling rules, and patient-safety coverage'],
  settings: ['Settings', 'Manage your pharmacist workspace preferences'],
  history: ['History', 'Review your completed professional activity'],
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

  return (
    <div className="pw-shell pw-workspace">
      <nav className="pw-sidebar" aria-label="Pharmacist navigation">
        <div className="pw-brand">
          <span className="pw-brand-mark"><img src={pharmateLogo} alt="PharMate" /></span>
          <span><strong>PharMate</strong><small>Pharmacist Portal</small></span>
        </div>
        <div className="pw-navigation" aria-label="Pharmacist navigation">
          {NAVIGATION_SECTIONS.map((section) => (
            <section className="pw-nav-section" key={section.label}>
              <div className="pw-menu-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => 'pw-navlink' + (isActive ? ' active' : '')}
                >
                  <item.icon aria-hidden="true" size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </div>
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
              <span className="pw-user-avatar" aria-hidden="true"><UserRound size={19} strokeWidth={2} /></span>
              <span>
                <strong>{user?.full_name || 'Pharmacist account'}</strong>
                <small title={user?.email || 'Pharmacist'}>{user?.email || 'Pharmacist'}</small>
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
