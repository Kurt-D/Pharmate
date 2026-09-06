import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';
import { inquiryPrivacy, INQUIRY_PRIVACY_UPDATED_AT } from '../../../shared/inquiryPrivacy.mjs';
import '../styles/inquiry-privacy.css';

export default function PrivacyPolicy() {
  const { language, setLanguage } = useLanguage();
  const copy = inquiryPrivacy[language] || inquiryPrivacy.en;
  return (
    <main className="pm-privacy-policy">
      <nav aria-label="Privacy navigation">
        <Link to="/login">PharMate</Link>
        <button type="button" onClick={() => setLanguage(language === 'fil' ? 'en' : 'fil')}>
          {language === 'fil' ? 'English' : 'Filipino'}
        </button>
      </nav>
      <h1>
        {language === 'fil'
          ? 'Privacy Policy — Mga Inquiry sa Parmasyutiko'
          : 'Privacy Policy — Pharmacist Inquiries'}
      </h1>
      <p>
        {language === 'fil' ? 'Na-update' : 'Updated'}: {INQUIRY_PRIVACY_UPDATED_AT}
      </p>
      <section id="inquiries">
        <h2>{copy.title}</h2>
        {[
          'storage',
          'access',
          'identity',
          'retention',
          'choice',
          'operators',
          'device',
          'record',
          'contact',
        ].map((key) => (
          <p key={key}>{copy[key]}</p>
        ))}
      </section>
      <Link to="/patient/ask">
        {language === 'fil' ? 'Pamahalaan ang pahintulot sa inquiry' : 'Manage inquiry consent'}
      </Link>
    </main>
  );
}
