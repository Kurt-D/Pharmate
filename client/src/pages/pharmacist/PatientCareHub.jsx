import { useSearchParams } from 'react-router-dom';
import { BellRing, CalendarDays, UsersRound } from 'lucide-react';
import Patients from './PatientsRedesign.jsx';
import Alerts from './Alerts.jsx';
import Counseling from './Counseling.jsx';

const PANELS = [
  ['patients', 'Patients', UsersRound, Patients],
  ['alerts', 'Follow-ups & Alerts', BellRing, Alerts],
  ['appointments', 'Appointments', CalendarDays, Counseling],
];

export default function PatientCareHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activePanel = searchParams.get('panel') || 'patients';
  const current = PANELS.find(([key]) => key === activePanel) || PANELS[0];
  const [, label, Icon, Panel] = current;

  function selectPanel(panel) {
    setSearchParams(panel === 'patients' ? {} : { panel });
  }

  return (
    <section className="px-care-hub">
      <nav className="px-care-hub__tabs" aria-label="Patient care panels" role="tablist">
        {PANELS.map(([key, panelLabel, PanelIcon]) => (
          <button
            aria-selected={key === current[0]}
            className={key === current[0] ? 'is-active' : ''}
            key={key}
            onClick={() => selectPanel(key)}
            role="tab"
            type="button"
          >
            <PanelIcon aria-hidden="true" size={16} /> <span>{panelLabel}</span>
          </button>
        ))}
      </nav>
      <div aria-label={label} className="px-care-hub__panel" role="tabpanel">
        <Panel />
      </div>
    </section>
  );
}
