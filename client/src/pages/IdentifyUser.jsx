import { Link, useNavigate } from 'react-router-dom';
import pharmateLogo from '../assets/pharmate-logo.png';
import '../styles/auth.css';
export default function IdentifyUser() {
  const navigate = useNavigate();
  return (
    <main className="auth-page">
      <section className="auth-shell identify">
        <div className="auth-logo" aria-label="PharMate">
          <img src={pharmateLogo} alt="PharMate" />
        </div>
        <header className="auth-heading">
          <span className="auth-kicker">Get started</span>
          <h1>How will you use PharMate?</h1>
          <p>Choose the option that best describes you.</p>
        </header>
        <button className="auth-choice" onClick={() => navigate('/signup')}>
          <span>
            <strong>I&apos;m a patient</strong>
            <small>Create a new personal account</small>
          </span>
          <b aria-hidden="true">›</b>
        </button>
        <button className="auth-choice" onClick={() => navigate('/login?join=caregiver')}>
          <span>
            <strong>I&apos;m a caregiver</strong>
            <small>Sign in and use a patient&apos;s code</small>
          </span>
          <b aria-hidden="true">›</b>
        </button>
        <p className="auth-identify-note">
          A caregiver signs in first, then enters the patient’s secure code from the Profile tab.
        </p>
        <Link className="auth-back-link" to="/login">
          Back to login
        </Link>
      </section>
    </main>
  );
}
