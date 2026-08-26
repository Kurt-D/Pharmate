import {
  Accessibility,
  ALargeSmall,
  Check,
  Contrast,
  Eye,
  Focus,
  Hand,
  Moon,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  SunMedium,
} from 'lucide-react';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import '../../styles/admin-accessibility.css';

const TEXT_SIZES = [
  { id: 'standard', label: 'Standard', detail: '16 px' },
  { id: 'large', label: 'Large', detail: '18 px' },
  { id: 'extraLarge', label: 'Extra Large', detail: '22 px' },
];

function SettingSwitch({ checked, description, icon: Icon, label, onChange }) {
  return (
    <article className="admin-a11y-setting">
      <span className="admin-a11y-setting__icon"><Icon size={21} strokeWidth={2.2} /></span>
      <div><strong>{label}</strong><p>{description}</p></div>
      <button
        aria-checked={checked}
        aria-label={`${label}: ${checked ? 'enabled' : 'disabled'}`}
        className={checked ? 'is-on' : ''}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      ><span /></button>
    </article>
  );
}

export default function AdminAccessibility() {
  const { preferences, updatePreference, resetPreferences } = useAccessibility();

  return (
    <section className="admin-a11y-workspace">
      <header className="admin-a11y-intro">
        <span><Accessibility size={29} strokeWidth={2.2} /></span>
        <div><small>ADMIN DISPLAY PREFERENCES</small><h2>Accessibility Settings</h2><p>Make system monitoring easier to read and operate. Changes apply immediately across every admin page and remain saved on this device.</p></div>
        <div className="admin-a11y-saved"><ShieldCheck size={17} /><span><b>Preferences saved</b><small>Stored automatically</small></span></div>
      </header>

      <div className="admin-a11y-grid">
        <section className="admin-a11y-card admin-a11y-text-card">
          <header><span><ALargeSmall size={21} /></span><div><h3>Text size</h3><p>Increase headings, tables, buttons, and monitoring information together.</p></div></header>
          <div className="admin-a11y-size-options" role="group" aria-label="Admin text size">
            {TEXT_SIZES.map((size) => <button aria-pressed={preferences.textSize === size.id} className={preferences.textSize === size.id ? 'active' : ''} key={size.id} onClick={() => updatePreference('textSize', size.id)} type="button"><span>{size.label}</span><small>{size.detail}</small>{preferences.textSize === size.id && <Check size={16} />}</button>)}
          </div>
          <div className="admin-a11y-preview"><span>LIVE PREVIEW</span><strong>System alert requires attention</strong><p>Review the pending prescription and confirm the next safe administrative action.</p><button type="button">Review alert</button></div>
        </section>

        <section className="admin-a11y-card">
          <header><span><Eye size={21} /></span><div><h3>Display and contrast</h3><p>Choose a comfortable appearance for long monitoring sessions.</p></div></header>
          <div className="admin-a11y-settings-list">
            <SettingSwitch checked={preferences.highContrast} description="Use stronger text, borders, and focus visibility." icon={Contrast} label="High contrast" onChange={(value) => updatePreference('highContrast', value)} />
            <SettingSwitch checked={preferences.darkMode} description="Use a dark workspace with readable light text." icon={Moon} label="Dark mode" onChange={(value) => updatePreference('darkMode', value)} />
            <SettingSwitch checked={preferences.warmTint} description="Reduce harsh white backgrounds during extended use." icon={SunMedium} label="Warm, low-glare tint" onChange={(value) => updatePreference('warmTint', value)} />
            <SettingSwitch checked={preferences.boldText} description="Strengthen important labels and table content." icon={Sparkles} label="Bolder text" onChange={(value) => updatePreference('boldText', value)} />
          </div>
        </section>

        <section className="admin-a11y-card">
          <header><span><Hand size={21} /></span><div><h3>Interaction assistance</h3><p>Make controls easier to locate and use accurately.</p></div></header>
          <div className="admin-a11y-settings-list">
            <SettingSwitch checked={preferences.largeTouch} description="Increase the clickable area of buttons and form controls." icon={Hand} label="Larger controls" onChange={(value) => updatePreference('largeTouch', value)} />
            <SettingSwitch checked={preferences.enhancedFocus} description="Show a clear blue outline while navigating by keyboard." icon={Focus} label="Enhanced keyboard focus" onChange={(value) => updatePreference('enhancedFocus', value)} />
            <SettingSwitch checked={preferences.extraSpacing} description="Add breathing room between text and interactive controls." icon={ALargeSmall} label="Extra spacing" onChange={(value) => updatePreference('extraSpacing', value)} />
            <SettingSwitch checked={preferences.reduceMotion} description="Limit animation and moving interface effects." icon={Eye} label="Reduce motion" onChange={(value) => updatePreference('reduceMotion', value)} />
          </div>
        </section>
      </div>

      <footer className="admin-a11y-footer"><div><ShieldCheck size={20} /><span><b>Accessibility preferences are device-specific</b><small>These settings do not change patient records, clinical data, or other administrators’ accounts.</small></span></div><button onClick={resetPreferences} type="button"><RefreshCcw size={17} /> Restore recommended defaults</button></footer>
    </section>
  );
}
