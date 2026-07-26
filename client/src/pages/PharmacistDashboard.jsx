import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PharmacistDashboard() {
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
              Validation Queue
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Drug Curation
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Inquiries
            </a>
          </li>
          <li>
            <a href="#" className="nav-link text-white-50">
              Patients
            </a>
          </li>
        </ul>
        <button className="btn btn-outline-secondary btn-sm mt-auto" onClick={handleLogout}>
          Sign out
        </button>
      </nav>

      <main className="pm-content">
        <h5 className="mb-4">Pharmacist Dashboard</h5>
        <div className="alert alert-info">Prescription validation queue arrives in Sprint 5.</div>
      </main>
    </div>
  );
}
