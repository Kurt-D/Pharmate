import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PatientDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
              My Schedule
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Medications
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Dose Log
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Ask Pharmacist
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Refills
            </a>
          </li>
          <li>
            <a href="/patient/onboarding" className="nav-link text-white-50">
              Schedule Settings
            </a>
          </li>
        </ul>
        <button className="btn btn-outline-secondary btn-sm mt-auto" onClick={handleLogout}>
          Sign out
        </button>
      </nav>

      <main className="pm-content">
        <h5 className="mb-1">Good day</h5>
        <p className="text-muted small mb-4">
          Patient code: <strong>{user?.patientCode ?? '—'}</strong>
        </p>
        <div className="alert alert-info">
          Sprint 1 shell — medication features arrive in Sprints 3–9.
        </div>
      </main>
    </div>
  );
}
