import { useNavigate } from 'react-router-dom';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { speak } from '../../lib/notifications.js';
import '../../styles/accessibility-settings.css';
import '../../styles/lively-blue.css';

function Icon({ name, size = 23 }) {
  const paths = {
    back: <path d="m15 18-6-6 6-6" />,
    type: (
      <>
        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
      </>
    ),
    contrast: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
    focus: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    spacing: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="m2 4 2 2-2 2M2 10l2 2-2 2M2 16l2 2-2 2" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
      </>
    ),
    hand: (
      <>
        <path d="M8 11V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 5-3 8-8 8h-1c-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-2l3 2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    warning: (
      <>
        <path d="M10.3 4.4 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.4a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    reset: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    >
      {paths[name]}
    </svg>
  );
}

function ToggleRow({ checked, description, icon, label, onChange }) {
  return (
    <div className="pm-a11y-toggle-row">
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <button
        aria-checked={checked}
        className={checked ? 'on' : ''}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <i />
      </button>
    </div>
  );
}

export default function AccessibilitySettings() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const { preferences, updatePreference, resetPreferences } = useAccessibility();
  const sample =
    preferences.speechLanguage === 'fil'
      ? 'Amoxicillin limang daang milligrams. Uminom ng isang capsule pagkatapos ng almusal.'
      : 'Amoxicillin 500 milligrams. Take one capsule after breakfast.';
  const textSizeLabel =
    preferences.textSize === 'extraLarge'
      ? tr('Extra Large text', 'Pinakamalaking text')
      : preferences.textSize === 'large'
        ? tr('Large text', 'Malaking text')
        : tr('Standard text', 'Standard na text');
  const displayLabel = preferences.darkMode
    ? tr('Dark mode', 'Dark mode')
    : preferences.warmTint
      ? tr('Warm display', 'Warm display')
      : preferences.highContrast
        ? tr('High contrast', 'High contrast')
        : tr('Comfort display', 'Comfort display');

  return (
    <main className="pm-accessibility-page">
      <header>
        <button
          aria-label={tr('Back to profile', 'Bumalik sa profile')}
          onClick={() => navigate('/patient/profile')}
          type="button"
        >
          <Icon name="back" />
        </button>
        <div>
          <h1>{tr('Accessibility Settings', 'Accessibility Settings')}</h1>
          <p>
            {tr(
              'Make PharMate easier to see, hear, and use.',
              'Gawing mas madaling makita, marinig, at gamitin ang PharMate.'
            )}
          </p>
        </div>
      </header>

      <section className="pm-a11y-overview" aria-labelledby="accessibility-overview-title">
        <span className="pm-a11y-overview__icon">
          <Icon name="shield" size={27} />
        </span>
        <div className="pm-a11y-overview__copy">
          <small>{tr('YOUR ACCESSIBILITY', 'IYONG ACCESSIBILITY')}</small>
          <h2 id="accessibility-overview-title">
            {tr('Preferences are active', 'Aktibo ang preferences')}
          </h2>
          <p>
            {tr(
              'Changes apply instantly across every patient page.',
              'Agad na naa-apply ang mga pagbabago sa lahat ng patient page.'
            )}
          </p>
        </div>
        <div
          className="pm-a11y-summary"
          aria-label={tr(
            'Current accessibility preferences',
            'Kasalukuyang accessibility preferences'
          )}
        >
          <span>
            <Icon name="type" size={17} /> {textSizeLabel}
          </span>
          <span>
            <Icon name={preferences.darkMode ? 'moon' : 'contrast'} size={17} /> {displayLabel}
          </span>
          <span className={preferences.ttsEnabled ? 'is-enabled' : ''}>
            <Icon name="volume" size={17} />{' '}
            {preferences.ttsEnabled
              ? tr('Listening on', 'Listening on')
              : tr('Listening off', 'Listening off')}
          </span>
        </div>
      </section>

      <section className="pm-a11y-section" aria-labelledby="text-settings-title">
        <div className="pm-a11y-section-title">
          <span>
            <Icon name="type" />
          </span>
          <div>
            <h2 id="text-settings-title">{tr('Text size', 'Laki ng text')}</h2>
            <p>
              {tr(
                'Changes text throughout the patient app.',
                'Binabago ang text sa buong patient app.'
              )}
            </p>
          </div>
        </div>
        <div className="pm-a11y-segmented pm-a11y-segmented--three">
          {[
            { v: 'standard', l: tr('Standard', 'Standard'), s: '16px' },
            { v: 'large', l: tr('Large', 'Malaki'), s: '18px' },
            { v: 'extraLarge', l: tr('Extra Large', 'Pinakamalaki'), s: '22px' },
          ].map((option) => (
            <button
              aria-pressed={preferences.textSize === option.v}
              className={preferences.textSize === option.v ? 'active' : ''}
              key={option.v}
              onClick={() => updatePreference('textSize', option.v)}
              type="button"
            >
              <strong>{option.l}</strong>
              <small>{option.s}</small>
            </button>
          ))}
        </div>
        <div className={`pm-a11y-preview ${preferences.textSize}`}>
          <small>{tr('LIVE PREVIEW', 'LIVE PREVIEW')}</small>
          <strong>Amoxicillin 500mg</strong>
          <p>
            {tr('Take 1 capsule after breakfast.', 'Uminom ng 1 capsule pagkatapos ng almusal.')}
          </p>
          <span>
            <Icon name="clock" size={18} /> 8:00 AM
          </span>
        </div>
      </section>

      <section className="pm-a11y-section" aria-labelledby="visual-settings-title">
        <div className="pm-a11y-section-title">
          <span>
            <Icon name="contrast" />
          </span>
          <div>
            <h2 id="visual-settings-title">{tr('Visual comfort', 'Visual comfort')}</h2>
            <p>
              {tr(
                'Improve contrast and reduce glare.',
                'Linawin ang contrast at bawasan ang glare.'
              )}
            </p>
          </div>
        </div>
        <ToggleRow
          checked={preferences.highContrast}
          description={tr(
            'Darker text and stronger card borders.',
            'Mas madilim na text at mas malinaw na borders.'
          )}
          icon="contrast"
          label={tr('High-contrast mode', 'High-contrast mode')}
          onChange={(value) => updatePreference('highContrast', value)}
        />
        <ToggleRow
          checked={preferences.warmTint}
          description={tr(
            'Uses a soft cream background for comfortable reading.',
            'Gumagamit ng soft cream background para komportableng magbasa.'
          )}
          icon="sun"
          label={tr('Warm, low-glare tint', 'Warm, low-glare tint')}
          onChange={(value) => {
            updatePreference('warmTint', value);
            if (value) updatePreference('darkMode', false);
          }}
        />
        <ToggleRow
          checked={preferences.darkMode}
          description={tr(
            'Uses a dark navy background with bright, readable text.',
            'Gumagamit ng dark navy background at maliwanag na text.'
          )}
          icon="moon"
          label={tr('Dark mode', 'Dark mode')}
          onChange={(value) => {
            updatePreference('darkMode', value);
            if (value) updatePreference('warmTint', false);
          }}
        />
        <div
          className="pm-a11y-status-preview"
          aria-label={tr('Status badge examples', 'Mga halimbawa ng status')}
        >
          <span className="verified">
            <Icon name="check" size={17} /> {tr('Verified', 'Verified')}
          </span>
          <span className="pending">
            <Icon name="clock" size={17} /> {tr('Pending Review', 'Pending Review')}
          </span>
          <span className="overdue">
            <Icon name="warning" size={17} /> {tr('Overdue', 'Overdue')}
          </span>
        </div>
      </section>

      <section className="pm-a11y-section" aria-labelledby="reading-settings-title">
        <div className="pm-a11y-section-title">
          <span>
            <Icon name="focus" />
          </span>
          <div>
            <h2 id="reading-settings-title">{tr('Reading and focus', 'Pagbasa at focus')}</h2>
            <p>
              {tr(
                'Reduce strain and make important controls easier to follow.',
                'Bawasan ang pagod sa mata at gawing mas madaling sundan ang controls.'
              )}
            </p>
          </div>
        </div>
        <ToggleRow
          checked={preferences.boldText}
          description={tr(
            'Makes medicine names, labels, and important text bolder.',
            'Ginagawang mas bold ang pangalan ng gamot, labels, at importanteng text.'
          )}
          icon="type"
          label={tr('Bolder important text', 'Mas bold na importanteng text')}
          onChange={(value) => updatePreference('boldText', value)}
        />
        <ToggleRow
          checked={preferences.extraSpacing}
          description={tr(
            'Adds more space between lines and reading sections.',
            'Nagdaragdag ng espasyo sa pagitan ng mga linya at sections.'
          )}
          icon="spacing"
          label={tr('Extra reading spacing', 'Dagdag na reading spacing')}
          onChange={(value) => updatePreference('extraSpacing', value)}
        />
        <ToggleRow
          checked={preferences.reduceMotion}
          description={tr(
            'Stops non-essential movement and animation.',
            'Pinatitigil ang hindi kailangang movement at animation.'
          )}
          icon="shield"
          label={tr('Reduce motion', 'Bawasan ang motion')}
          onChange={(value) => updatePreference('reduceMotion', value)}
        />
        <ToggleRow
          checked={preferences.enhancedFocus}
          description={tr(
            'Shows a thick blue outline around the selected control.',
            'Nagpapakita ng makapal na blue outline sa napiling control.'
          )}
          icon="focus"
          label={tr('Strong focus indicator', 'Malinaw na focus indicator')}
          onChange={(value) => updatePreference('enhancedFocus', value)}
        />
      </section>

      <section className="pm-a11y-section" aria-labelledby="audio-settings-title">
        <div className="pm-a11y-section-title">
          <span>
            <Icon name="volume" />
          </span>
          <div>
            <h2 id="audio-settings-title">{tr('Read aloud', 'Basahin nang malakas')}</h2>
            <p>
              {tr(
                'Hear medicine and order instructions.',
                'Pakinggan ang tagubilin sa gamot at order.'
              )}
            </p>
          </div>
        </div>
        <ToggleRow
          checked={preferences.ttsEnabled}
          description={tr(
            'Shows and enables Listen buttons.',
            'Ipinapakita at ginagamit ang Listen buttons.'
          )}
          icon="volume"
          label={tr('Text-to-speech', 'Text-to-speech')}
          onChange={(value) => updatePreference('ttsEnabled', value)}
        />
        <fieldset disabled={!preferences.ttsEnabled}>
          <legend>{tr('Speech speed', 'Bilis ng pagsasalita')}</legend>
          <div className="pm-a11y-segmented">
            {[
              { v: 'slow', l: tr('Slow & Clear', 'Mabagal at malinaw'), s: '0.75x' },
              { v: 'normal', l: tr('Normal', 'Normal'), s: '1.0x' },
            ].map((option) => (
              <button
                aria-pressed={preferences.speechRate === option.v}
                className={preferences.speechRate === option.v ? 'active' : ''}
                key={option.v}
                onClick={() => updatePreference('speechRate', option.v)}
                type="button"
              >
                <strong>{option.l}</strong>
                <small>{option.s}</small>
              </button>
            ))}
          </div>
          <label>
            {tr('Audio language', 'Wika ng audio')}
            <select
              onChange={(event) => updatePreference('speechLanguage', event.target.value)}
              value={preferences.speechLanguage}
            >
              <option value="en">English</option>
              <option value="fil">Taglish / Filipino</option>
            </select>
          </label>
          <button className="pm-a11y-listen-test" onClick={() => speak(sample)} type="button">
            <Icon name="volume" /> {tr('Play voice sample', 'Pakinggan ang sample')}
          </button>
        </fieldset>
      </section>

      <section className="pm-a11y-section" aria-labelledby="interaction-settings-title">
        <div className="pm-a11y-section-title">
          <span>
            <Icon name="hand" />
          </span>
          <div>
            <h2 id="interaction-settings-title">{tr('Touch and safety', 'Touch at kaligtasan')}</h2>
            <p>
              {tr(
                'Make controls easier and prevent mistakes.',
                'Gawing mas madali ang controls at iwasan ang pagkakamali.'
              )}
            </p>
          </div>
        </div>
        <ToggleRow
          checked={preferences.largeTouch}
          description={tr(
            'Makes buttons and navigation at least 56px tall.',
            'Ginagawang hindi bababa sa 56px ang buttons at navigation.'
          )}
          icon="hand"
          label={tr('Large touch targets', 'Malalaking touch targets')}
          onChange={(value) => updatePreference('largeTouch', value)}
        />
        <ToggleRow
          checked={preferences.confirmActions}
          description={tr(
            'Confirms logging a dose or other important actions.',
            'Humihingi ng confirmation bago mag-log ng dose o mahalagang action.'
          )}
          icon="shield"
          label={tr('Accidental tap protection', 'Proteksyon sa maling tap')}
          onChange={(value) => updatePreference('confirmActions', value)}
        />
      </section>

      <div className="pm-a11y-saved">
        <Icon name="check" />{' '}
        <span>
          <strong>
            {tr('Settings save automatically', 'Awtomatikong nase-save ang settings')}
          </strong>
          <small>
            {tr(
              'Your choices remain after closing or refreshing the app.',
              'Mananatili ang iyong pinili matapos isara o i-refresh ang app.'
            )}
          </small>
        </span>
      </div>
      <button className="pm-a11y-reset" onClick={resetPreferences} type="button">
        <Icon name="reset" />{' '}
        {tr('Restore recommended settings', 'Ibalik ang recommended settings')}
      </button>
    </main>
  );
}
