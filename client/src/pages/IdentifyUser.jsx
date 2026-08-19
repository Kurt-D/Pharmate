import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';
export default function IdentifyUser() {
  const navigate = useNavigate();
  return (
    <main className="auth-page">
      <section className="auth-shell identify">
        <div className="auth-logo">
          <b>P</b>
          <i>●</i>
        </div>
        <div className="auth-heading">
          <h1>Are you using PharMate for yourself?</h1>
        </div>
        <button className="auth-choice" onClick={() => navigate('/signup')}>
          Yes, I am the patient <span>›</span>
        </button>
        <button className="auth-choice" onClick={() => navigate('/login?role=caregiver')}>
          No, I have a caregiver code <span>›</span>
        </button>
        <p>
          A caregiver signs in first, then enters the patient’s secure code from the Profile tab.
        </p>
      </section>
    </main>
  );
}
