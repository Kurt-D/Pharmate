import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function CaregiverDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="d-flex">
      <nav className="pm-sidebar d-flex flex-column p-3">
        <span className="pm-brand text-white mb-4">PharMate</span>
        <ul className="nav flex-column gap-1 flex-grow-1">
          <li>
            <a href="#" className="nav-link text-white-50">
              Linked Patients
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Missed Dose Alerts
            </a>
          </li>
        </ul>
        <button className="btn btn-outline-secondary btn-sm mt-auto" onClick={handleLogout}>
          Sign out
        </button>
      </nav>

      <main className="pm-content">
        <h5 className="mb-4">Caregiver Dashboard</h5>
        <div className="alert alert-info">Caregiver alerts arrive in Sprint 7.</div>
      </main>
    </div>
  );
}
