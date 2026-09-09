import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { inquiryPrivacy, INQUIRY_PRIVACY_VERSION } from '../../../shared/inquiryPrivacy.mjs';
import '../styles/inquiry-privacy.css';

export default function InquiryConsent({ consent }) {
  const { language } = useLanguage();
  const copy = inquiryPrivacy[language] || inquiryPrivacy.en;
  const [checked, setChecked] = useState(false);
  return (
    <section className="pm-inquiry-consent" aria-label={copy.title}>
      <header className="pm-inquiry-consent__header">
        <span aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24">
            <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <div>
          <h2>
            {language === 'fil' ? 'Pribado ang iyong usapan' : 'Your conversation is private'}
          </h2>
          <p>
            {language === 'fil'
              ? 'Bago ka magtanong sa parmasyutiko'
              : 'Before you ask a pharmacist'}
          </p>
        </div>
      </header>

      <div className="pm-inquiry-consent__summary">
        <strong>{language === 'fil' ? 'Mahalagang malaman' : 'What you need to know'}</strong>
        <ul>
          <li>
            {language === 'fil'
              ? 'Ise-save ang usapan sa iyong PharMate account.'
              : 'Your conversation is saved in your PharMate account.'}
          </li>
          <li>
            {language === 'fil'
              ? 'Ikaw at ang nakatalagang parmasyutiko lamang ang makakakita nito sa app.'
              : 'You and the assigned pharmacist can view it in the app.'}
          </li>
          <li>
            {language === 'fil'
              ? 'Maaari mong bawiin ang pahintulot anumang oras.'
              : 'You can withdraw permission at any time.'}
          </li>
        </ul>
      </div>

      <details className="pm-inquiry-consent__details">
        <summary>
          {language === 'fil' ? 'Tingnan ang buong detalye' : 'View full privacy details'}
        </summary>
        <p>{copy.storage}</p>
        <p>{copy.retention}</p>
        {['access', 'identity', 'operators', 'device', 'record', 'choice', 'contact'].map((key) => (
          <p key={key}>{copy[key]}</p>
        ))}
        <a href="/privacy#inquiries" target="_blank" rel="noreferrer">
          {copy.policyLink}
        </a>
        <small>
          {language === 'fil' ? 'Bersiyon ng policy' : 'Policy version'}: {INQUIRY_PRIVACY_VERSION}
        </small>
      </details>

      <p
        className={`pm-inquiry-consent__status${consent.consented ? ' is-active' : ''}`}
        role="status"
      >
        {consent.busy
          ? language === 'fil'
            ? 'Sinusuri…'
            : 'Checking…'
          : consent.consented
            ? copy.enabled
            : language === 'fil'
              ? 'Kailangan ang pahintulot bago magtanong.'
              : 'Permission is needed before you can ask a question.'}
      </p>
      {consent.error && <p role="alert">{consent.error}</p>}
      {consent.error && (
        <button type="button" disabled={consent.busy} onClick={consent.refresh}>
          {language === 'fil' ? 'Subukan muli' : 'Retry'}
        </button>
      )}
      {consent.consented ? (
        <>
          <button
            className="pm-inquiry-consent__secondary"
            type="button"
            disabled={consent.busy}
            onClick={() => {
              setChecked(false);
              consent.update(false);
            }}
          >
            {copy.withdraw}
          </button>
        </>
      ) : (
        <>
          <label className="pm-inquiry-consent__check">
            <input
              type="checkbox"
              checked={checked}
              disabled={consent.busy}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>
              {language === 'fil'
                ? 'Nabasa ko ito at pumapayag akong i-save ang aking usapan.'
                : 'I understand and agree to save my inquiry conversation.'}
            </span>
          </label>
          <button
            type="button"
            disabled={!checked || consent.busy || !consent.state}
            onClick={() => consent.update(true)}
          >
            {copy.grant}
          </button>
        </>
      )}
    </section>
  );
}
