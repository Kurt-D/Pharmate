import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { speak } from '../../lib/notifications.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'prescription', label: 'Needs Rx' },
];

function medicationStatus(medicine) {
  if (medicine.status === 'pending_drug') return { label: 'Needs review', tone: 'review' };
  if (medicine.status === 'pending_validation' && medicine.prescription_status === 'pending') {
    return medicine.prescription_review_stage === 'schedule'
      ? { label: 'Schedule under review', tone: 'pending' }
      : { label: 'Prescription under review', tone: 'pending' };
  }
  if (medicine.status === 'pending_validation') return { label: 'Prescription needed', tone: 'warning' };
  return { label: 'Active', tone: 'active' };
}

function medicineDetails(medicine) {
  return [medicine.dosage_instruction, medicine.frequency].filter(Boolean).join(' · ') || 'Instructions not added';
}

export default function Medications() {
  const navigate = useNavigate();
  const { language } = useLanguage(); const tr = (english, filipino) => language === 'fil' ? filipino : english;
  const [meds, setMeds] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api('/api/patient/medications')
      .then((response) => setMeds(response.data))
      .catch((requestError) => setError(requestError.message));
  }, []);

  const visibleMeds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (meds || []).filter((medicine) => {
      const matchesSearch = !normalizedQuery || medicine.drug_name_raw.toLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === 'all'
        || (filter === 'active' && medicine.status === 'active')
        || (filter === 'prescription' && medicine.status === 'pending_validation');
      return matchesSearch && matchesFilter;
    });
  }, [meds, query, filter]);

  return (
    <main className="pm-medications-page">
      <header className="pm-medications-header">
        <div><h1>{tr('My Medications', 'Aking mga Gamot')}</h1><p>{tr('View and manage your medicines.', 'Tingnan at pamahalaan ang iyong mga gamot.')}</p></div>
      </header>

      <section className="pm-med-entry-actions" aria-label="Add a medicine">
        <button type="button" onClick={() => navigate('/patient/medications/add?mode=manual')}>
          <span aria-hidden="true">⌨️</span>
          <strong>{tr('Enter Manually', 'Manu-manong Ilagay')}</strong>
          <small>{tr('Type medicine details', 'I-type ang detalye ng gamot')}</small>
        </button>
        <button type="button" className="pm-med-entry-actions__scan" onClick={() => navigate('/patient/medications/prescription')}>
          <span aria-hidden="true">📷</span>
          <strong>{tr('Scan Prescription', 'I-scan ang Reseta')}</strong>
          <small>{tr('Upload with OCR', 'I-upload gamit ang OCR')}</small>
        </button>
      </section>

      <label className="pm-med-search">
        <span aria-hidden="true">⌕</span>
        <span className="visually-hidden">Search medicines</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search your medicines', 'Hanapin ang iyong mga gamot')} />
      </label>

      <div className="pm-med-filters" aria-label="Filter medications">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? 'active' : ''}
            onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.id === 'all' ? tr('All', 'Lahat') : item.id === 'active' ? tr('Active', 'Aktibo') : tr('Needs Rx', 'Kailangan ng Reseta')}</button>
        ))}
      </div>

      {error && <div className="pm-banner pm-banner--warn">{error}</div>}
      {meds === null && !error && <div className="pm-med-loading">{tr('Loading your medicines…', 'Nilo-load ang iyong mga gamot…')}</div>}

      {meds?.length === 0 && (
        <section className="pm-med-empty">
          <div className="pm-med-empty__icon" aria-hidden="true">💊</div>
          <h2>{tr('You have no medicines yet', 'Wala ka pang gamot')}</h2>
          <p>{tr('Add your first medicine to create a safe daily schedule and receive reminders.', 'Idagdag ang unang gamot upang makagawa ng ligtas na iskedyul at makatanggap ng mga paalala.')}</p>
          <button type="button" className="pm-action-button" onClick={() => navigate('/patient/medications/add?mode=manual')}>＋ {tr('Enter Manually', 'Manu-manong Ilagay')}</button>
        </section>
      )}

      {meds && meds.length > 0 && (
        <section className="pm-med-list" aria-label="Your medicines">
          <div className="pm-med-list__heading"><h2>{tr('Your Medicines', 'Iyong mga Gamot')}</h2><span>{visibleMeds.length} {tr('shown', 'nakikita')}</span></div>
          {visibleMeds.length === 0 && <div className="pm-med-no-results">{tr('No medicines match your search.', 'Walang gamot na tumutugma sa iyong paghahanap.')}</div>}
          {visibleMeds.map((medicine, index) => {
            const status = medicationStatus(medicine);
            const isExpanded = expanded === medicine.id;
            const needsPhoto = medicine.status === 'pending_validation'
              && medicine.source === 'RX_VALIDATED'
              && medicine.prescription_status !== 'pending';
            const wasRejected = ['rejected', 'needs_clearer'].includes(medicine.prescription_status);
            const details = medicineDetails(medicine);

            return (
              <article key={medicine.id} className="pm-medication-card">
                <div className="pm-medication-card__main">
                  <div className={`pm-medication-visual pm-medication-visual--${index % 4}`} aria-hidden="true">
                    <span>▰</span><i />
                  </div>
                  <div className="pm-medication-card__info">
                    <div className="pm-medication-card__title"><h3>{medicine.drug_name_raw}</h3>
                      <span className={`pm-med-status pm-med-status--${status.tone}`}>{language === 'fil' ? ({ Active: 'Aktibo', 'Needs review': 'Kailangang suriin', 'Schedule under review': 'Sinusuri ang iskedyul', 'Prescription under review': 'Sinusuri ang reseta', 'Prescription needed': 'Kailangan ng reseta' }[status.label] || status.label) : status.label}</span></div>
                    <p>{details}</p>
                    {medicine.status === 'active' && <small><span aria-hidden="true">●</span> {tr('Ready for your schedule', 'Handa na para sa iyong iskedyul')}</small>}
                  </div>
                </div>

                {wasRejected && medicine.prescription_reason && (
                  <div className="pm-prescription-note"><strong>{tr('Pharmacist’s note', 'Tala ng parmasyutiko')}</strong><span>{medicine.prescription_reason}</span></div>
                )}

                {isExpanded && (
                  <div className="pm-medication-details">
                    <div><span>{tr('Dosage instructions', 'Tagubilin sa dosis')}</span><strong>{medicine.dosage_instruction || tr('Not provided', 'Hindi ibinigay')}</strong></div>
                    <div><span>{tr('Frequency', 'Dalas')}</span><strong>{medicine.frequency || tr('Not provided', 'Hindi ibinigay')}</strong></div>
                    <button type="button" onClick={() => speak(`${medicine.drug_name_raw}. ${details}`)}>
                      <span aria-hidden="true">🔊</span> {tr('Read instructions aloud', 'Basahin nang malakas ang tagubilin')}
                    </button>
                  </div>
                )}

                {needsPhoto && (
                  <button type="button" className="pm-upload-rx-button"
                    onClick={() => navigate(`/patient/medications/${medicine.id}/prescription`)}>
                    <span aria-hidden="true">▣</span> {wasRejected ? tr('Upload a clearer prescription', 'Mag-upload ng mas malinaw na reseta') : tr('Upload Prescription', 'Mag-upload ng Reseta')}
                  </button>
                )}

                <button type="button" className="pm-view-med-button"
                  onClick={() => setExpanded(isExpanded ? null : medicine.id)} aria-expanded={isExpanded}>
                  {isExpanded ? tr('Hide Details', 'Itago ang Detalye') : tr('View Details', 'Tingnan ang Detalye')} <span aria-hidden="true">{isExpanded ? '⌃' : '›'}</span>
                </button>
              </article>
            );
          })}
        </section>
      )}

      {meds && meds.length > 0 && (
        <section className="pm-med-schedule-prompt">
          <span aria-hidden="true">▦</span><div><h2>{tr('Ready to plan your day?', 'Handa ka na bang planuhin ang araw?')}</h2><p>{tr('Create safe times for each medicine.', 'Gumawa ng ligtas na oras para sa bawat gamot.')}</p></div>
          <button type="button" onClick={() => navigate('/patient/schedule')}>{tr('Create Schedule', 'Gumawa ng Iskedyul')}</button>
        </section>
      )}
    </main>
  );
}
