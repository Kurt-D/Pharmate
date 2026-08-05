import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

// Patient profile — shows the pseudonymous patient code and a Sign out control.
export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <h1 className="pm-title" style={{ fontSize: '1.4rem' }}>
        Profile
      </h1>
      <p className="pm-subtitle">Your account.</p>

      <div className="pm-card p-3 mb-3">
        <div className="text-muted small">Patient code</div>
        <div className="fs-5 fw-bold">{user?.patientCode ?? '—'}</div>
        <div className="text-muted small mt-2">
          This code is how pharmacists and caregivers see you — never your name.
        </div>
      </div>

      <button className="pm-btn-primary" onClick={handleLogout}>
        Sign out
      </button>
    </>
  );
}
