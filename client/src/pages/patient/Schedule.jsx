import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

function Icon({ name, size = 22 }) {
  const paths = {
    add: <path d="M12 5v14M5 12h14" />,
    back: <path d="m15 18-6-6 6-6" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    select: <rect x="4" y="4" width="16" height="16" rx="2" />,
    selectAll: (
      <>
        <rect x="7" y="7" width="13" height="13" rx="2" />
        <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        <path d="m10 13 2 2 4-5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
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
      strokeWidth="2.3"
    >
      {paths[name]}
    </svg>
  );
}

const medicineName = (item) => item.drug_name || item.drug_name_raw || item.name || 'Medicine';
const doseText = (item) =>
  item.dosage_instruction || item.strength || item.dosage || 'Follow prescribed dose';

function dateAtTime(value) {
  if (!value) return null;
  if (value.includes?.('T')) return new Date(value);
  const [hours, minutes] = String(value).split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function normalizeRows({ doses, proposal, medicines, manual, source }) {
  let rows = [];
  if (doses.length) {
    rows = doses.map((dose) => ({
      ...dose,
      timeValue: dose.scheduled_time,
      reason: dose.generated_reason || dose.frequency,
    }));
  } else if (source === 'manual' && manual?.times?.length) {
    const medicine =
      medicines.find(
        (item) => medicineName(item).toLowerCase() === String(manual.medicine || '').toLowerCase()
      ) ||
      medicines[0] ||
      {};
    rows = manual.times.map((scheduledTime, index) => ({
      ...medicine,
      drug_name: manual.medicine || medicineName(medicine),
      dosage_instruction: manual.strength || doseText(medicine),
      timeValue: scheduledTime,
      reason: `${manual.frequency || 'Custom frequency'} · ${manual.form || 'Medicine'}`,
      rowKey: `manual-${index}`,
    }));
  } else if (proposal?.slots?.length) {
    rows = proposal.slots.map((slot, index) => {
      const medicine = medicines.find((item) => item.id === slot.medication_id) || {};
      return {
        ...medicine,
        ...slot,
        timeValue: slot.time,
        reason: slot.generated_reason || medicine.frequency,
        rowKey: `slot-${slot.medication_id}-${slot.time}-${index}`,
      };
    });
  } else {
    rows = medicines.map((medicine, index) => ({
      ...medicine,
      timeValue: index ? `${String(8 + index * 3).padStart(2, '0')}:00` : '08:00',
      reason: medicine.frequency || 'Once daily',
      rowKey: `medicine-${medicine.id || index}`,
    }));
  }
  const unique = new Map();
  rows.forEach((row, index) => {
    const date = dateAtTime(row.timeValue);
    if (!date || Number.isNaN(date.getTime())) return;
    const key = `${row.medication_id || row.id || medicineName(row)}-${date.getHours()}:${date.getMinutes()}`;
    if (!unique.has(key)) unique.set(key, { ...row, date, rowKey: row.rowKey || key || index });
  });
  return [...unique.values()].sort((a, b) => a.date - b.date);
}

export default function Schedule() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const [medicines, setMedicines] = useState([]);
  const [doses, setDoses] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [removedRows, setRemovedRows] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const source = localStorage.getItem('pm_medication_schedule_source') || 'suggested';
  const scheduleHidden = localStorage.getItem('pm_schedule_hidden') === '1';
  const hasSavedSchedule =
    !scheduleHidden &&
    (localStorage.getItem('pm_has_medication_schedule') === '1' || doses.length > 0);
  let manual = null;
  try {
    manual = JSON.parse(localStorage.getItem('pm_manual_medication_schedule') || 'null');
  } catch {
    /* Ignore invalid local draft. */
  }

  useEffect(() => {
    Promise.all([
      api('/api/patient/medications')
        .then((response) => response.data)
        .catch(() => []),
      api('/api/patient/doses/today')
        .then((response) => response.data)
        .catch(() => []),
      api('/api/patient/schedule')
        .then((response) => response.data)
        .catch(() => null),
    ]).then(([medicineData, doseData, proposalData]) => {
      let savedRows = [];
      let frontendMedicines = [];
      try {
        savedRows = JSON.parse(localStorage.getItem('pm_saved_schedule_rows') || '[]') || [];
      } catch {
        savedRows = [];
      }
      try {
        frontendMedicines =
          JSON.parse(localStorage.getItem('pm_frontend_medications') || '[]') || [];
      } catch {
        frontendMedicines = [];
      }
      const combinedMedicines = [
        ...medicineData,
        ...frontendMedicines.filter(
          (draft) =>
            !medicineData.some(
              (medicine) =>
                medicine.id === draft.id ||
                medicineName(medicine).toLowerCase() === medicineName(draft).toLowerCase()
            )
        ),
      ];
      const historyRows = doseData.filter(
        (dose) => !['scheduled', 'snoozed'].includes(dose.status)
      );
      const activeRows = savedRows.length
        ? savedRows
        : doseData.filter((dose) => ['scheduled', 'snoozed'].includes(dose.status));
      setMedicines(combinedMedicines);
      setDoses([...activeRows, ...historyRows]);
      setProposal(proposalData);
      setLoading(false);
    });
  }, []);

  const rows = useMemo(
    () => normalizeRows({ doses, proposal, medicines, manual, source }),
    [doses, proposal, medicines, manual, source]
  );
  const visibleRows = rows.filter((row) => !removedRows.has(String(row.rowKey)));
  const hasOngoingSchedule = hasSavedSchedule && visibleRows.length > 0;
  const groups = [
    {
      id: 'morning',
      icon: 'medicine',
      label: tr('Morning', 'Umaga'),
      range: tr('Before 12:00 PM', 'Bago mag-12:00 PM'),
      rows: visibleRows.filter((row) => row.date.getHours() < 12),
    },
    {
      id: 'afternoon',
      icon: 'medicine',
      label: tr('Afternoon', 'Hapon'),
      range: tr('12:00 PM to 5:59 PM', '12:00 PM hanggang 5:59 PM'),
      rows: visibleRows.filter((row) => row.date.getHours() >= 12 && row.date.getHours() < 18),
    },
    {
      id: 'evening',
      icon: 'medicine',
      label: tr('Night', 'Gabi'),
      range: tr('6:00 PM onward', 'Mula 6:00 PM'),
      rows: visibleRows.filter((row) => row.date.getHours() >= 18),
    },
  ].filter((group) => group.rows.length);

  function editSchedule() {
    sessionStorage.setItem('pm_open_schedule_editor', '1');
    navigate('/patient/medications');
  }

  function editMedicine(row) {
    const medicationId = row.medication_id || row.id;
    if (medicationId && !String(medicationId).startsWith('frontend-')) {
      navigate(`/patient/medications/add?edit=${medicationId}`);
      return;
    }
    editSchedule();
  }

  function addMedicineForSchedule() {
    sessionStorage.setItem('pm_choose_schedule_after_add', '1');
    navigate('/patient/medications/add');
  }

  function toggleSelection(rowKey) {
    setSelectedRows((current) => {
      const next = new Set(current);
      const key = String(rowKey);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setEditMode(false);
    setSelectionMode(true);
    setSelectedRows((current) =>
      current.size === visibleRows.length
        ? new Set()
        : new Set(visibleRows.map((row) => String(row.rowKey)))
    );
  }

  async function deleteSelected() {
    if (!selectedRows.size) return;
    const confirmed = window.confirm(
      tr('Delete the selected schedule items?', 'Tanggalin ang mga napiling item sa iskedyul?')
    );
    if (!confirmed) return;
    setDeleting(true);
    setScheduleError('');
    const selected = visibleRows.filter((row) => selectedRows.has(String(row.rowKey)));
    const remaining = visibleRows.filter((row) => !selectedRows.has(String(row.rowKey)));
    const next = new Set([...removedRows, ...selectedRows]);
    setRemovedRows(next);
    localStorage.setItem('pm_removed_schedule_rows', JSON.stringify([...next]));
    const persistedRows = remaining.map((row, index) => {
      const persisted = { ...row };
      delete persisted.date;
      delete persisted.rowKey;
      delete persisted.timeValue;
      return {
        ...persisted,
        medication_id: row.medication_id || row.id,
        scheduled_time: row.scheduled_time || row.date.toISOString(),
        schedule_id: row.schedule_id || `saved-remaining-${index}`,
        status: 'scheduled',
      };
    });
    localStorage.setItem('pm_saved_schedule_rows', JSON.stringify(persistedRows));
    setDoses((current) => [
      ...persistedRows,
      ...current.filter((dose) => !['scheduled', 'snoozed'].includes(dose.status)),
    ]);
    if (!remaining.length) {
      localStorage.removeItem('pm_has_medication_schedule');
      localStorage.setItem('pm_schedule_hidden', '1');
    } else {
      localStorage.setItem('pm_has_medication_schedule', '1');
      localStorage.removeItem('pm_schedule_hidden');
    }
    setSelectedRows(new Set());
    setSelectionMode(false);
    try {
      await api('/api/patient/schedule/items', {
        method: 'DELETE',
        body: { schedule_ids: selected.map((row) => row.schedule_id).filter(Boolean) },
      });
    } catch {
      setScheduleError(
        tr(
          'The reminders were removed from this device, but the server could not be updated. Please try again when connected.',
          'Inalis ang mga paalala sa device na ito, ngunit hindi na-update ang server. Subukan muli kapag may koneksyon.'
        )
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading)
    return (
      <main className="pm-saved-schedule">
        <div className="pm-schedule-loading">
          {tr('Loading your saved schedule…', 'Nilo-load ang iyong iskedyul…')}
        </div>
      </main>
    );

  if (!hasSavedSchedule || !rows.length)
    return (
      <main className="pm-saved-schedule">
        <header className="pm-saved-schedule__title">
          <button
            onClick={() => navigate('/patient/medications')}
            aria-label={tr('Back to medications', 'Bumalik sa medications')}
            type="button"
          >
            <Icon name="back" />
          </button>
          <div>
            <h1>{tr('Your Schedule', 'Iyong Iskedyul')}</h1>
            <p>
              {tr('View your medication reminder times.', 'Tingnan ang oras ng paalala sa gamot.')}
            </p>
          </div>
        </header>
        <section className="pm-schedule-empty">
          <span>
            <Icon name="calendar" size={34} />
          </span>
          <h2>{tr('No saved schedule yet', 'Wala pang naka-save na iskedyul')}</h2>
          <p>
            {tr(
              'Create a schedule from your medicine list to activate reminders.',
              'Gumawa ng iskedyul mula sa listahan ng gamot upang i-activate ang mga paalala.'
            )}
          </p>
          <button onClick={() => navigate('/patient/medications')} type="button">
            {tr('Create Schedule', 'Gumawa ng Iskedyul')}
          </button>
        </section>
      </main>
    );

  return (
    <main className="pm-saved-schedule">
      <header className="pm-saved-schedule__title">
        <button
          onClick={() => navigate('/patient/medications')}
          aria-label={tr('Back to medications', 'Bumalik sa medications')}
          type="button"
        >
          <Icon name="back" />
        </button>
        <div>
          <h1>{tr('Medication Schedule', 'Iskedyul ng Gamot')}</h1>
          <p>
            {editMode
              ? tr(
                  'Choose the medicine you want to edit.',
                  'Piliin ang gamot na gusto mong i-edit.'
                )
              : tr(
                  'Review the reminder times currently being used.',
                  'Suriin ang kasalukuyang oras ng mga paalala.'
                )}
          </p>
        </div>
      </header>
      {scheduleError && (
        <div className="pm-banner pm-banner--warn" role="alert">
          {scheduleError}
        </div>
      )}

      <div
        aria-label={tr('Schedule actions', 'Mga aksyon sa iskedyul')}
        className="pm-schedule-icon-toolbar"
        role="toolbar"
      >
        {hasOngoingSchedule && (
          <>
            <button
              aria-label={tr('Select items', 'Pumili ng mga item')}
              aria-pressed={selectionMode}
              className={selectionMode ? 'active' : ''}
              onClick={() => {
                setEditMode(false);
                setSelectionMode((value) => !value);
                setSelectedRows(new Set());
              }}
              type="button"
            >
              <Icon name="select" />
              <small>{tr('Select', 'Pumili')}</small>
            </button>
            <button
              aria-label={tr('Select all items', 'Piliin lahat ng item')}
              aria-pressed={selectedRows.size === visibleRows.length}
              onClick={toggleSelectAll}
              type="button"
            >
              <Icon name="selectAll" />
              <small>{tr('Select all', 'Lahat')}</small>
            </button>
          </>
        )}
        <button
          aria-label={tr('Add new medicine', 'Magdagdag ng bagong gamot')}
          onClick={addMedicineForSchedule}
          type="button"
        >
          <Icon name="add" />
          <small>{tr('Add medicine', 'Magdagdag')}</small>
        </button>
        <button
          aria-label={tr('Edit a medicine', 'I-edit ang isang gamot')}
          aria-pressed={editMode}
          className={editMode ? 'active' : ''}
          onClick={() => {
            setEditMode((value) => !value);
            setSelectionMode(false);
            setSelectedRows(new Set());
          }}
          type="button"
        >
          <Icon name={editMode ? 'check' : 'edit'} />
          <small>{editMode ? tr('Done', 'Tapos') : tr('Edit', 'I-edit')}</small>
        </button>
        <button
          aria-label={tr('Delete selected items', 'Tanggalin ang mga napiling item')}
          className="danger"
          disabled={!selectedRows.size || deleting}
          onClick={deleteSelected}
          type="button"
        >
          <Icon name="trash" />
          <small>{deleting ? tr('Deleting', 'Tinatanggal') : tr('Delete', 'Tanggalin')}</small>
        </button>
      </div>

      <div
        className={`pm-schedule-groups ${selectionMode ? 'is-selecting' : ''} ${editMode ? 'is-editing' : ''}`}
      >
        {groups.map((group) => (
          <section key={group.id}>
            <header>
              <div className={`pm-schedule-period-title ${group.id}`}>
                <span>
                  <Icon name={group.icon} />
                </span>
                <div>
                  <h2>{group.label}</h2>
                  <small>{group.range}</small>
                </div>
              </div>
              <b>{group.rows.length}</b>
            </header>
            <div>
              {group.rows.map((row) => {
                const selected = selectedRows.has(String(row.rowKey));
                return (
                  <article className={selected ? 'selected' : ''} key={row.rowKey}>
                    {selectionMode && (
                      <button
                        aria-label={`${tr('Select', 'Piliin')} ${medicineName(row)}`}
                        aria-pressed={selected}
                        className="pm-schedule-row-select"
                        onClick={() => toggleSelection(row.rowKey)}
                        type="button"
                      >
                        {selected && <Icon name="check" size={19} />}
                      </button>
                    )}
                    <time>
                      <Icon name="clock" />
                      <strong>
                        {row.date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </strong>
                    </time>
                    <span className="pm-saved-med-icon">
                      <Icon name="medicine" />
                    </span>
                    <div>
                      <h3>{medicineName(row)}</h3>
                      <p>{doseText(row)}</p>
                      <small>
                        {row.reason ||
                          tr(
                            'Follow the saved medication instructions',
                            'Sundin ang naka-save na tagubilin'
                          )}
                      </small>
                    </div>
                    {editMode && (
                      <button
                        aria-label={`${tr('Edit', 'I-edit')} ${medicineName(row)}`}
                        className="pm-schedule-row-edit"
                        onClick={() => editMedicine(row)}
                        type="button"
                      >
                        <Icon name="edit" size={17} />
                        <span>{tr('Edit', 'I-edit')}</span>
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="pm-schedule-safety">
        <Icon name="shield" />
        <div>
          <strong>{tr('Reminder schedule in use', 'Ginagamit na iskedyul ng paalala')}</strong>
          <p>
            {tr(
              'PharMate uses these saved times for reminders and adherence tracking. Changes should be reviewed before saving.',
              'Ginagamit ng PharMate ang oras na ito para sa paalala at adherence tracking. Suriin muna ang anumang pagbabago bago i-save.'
            )}
          </p>
        </div>
      </aside>
    </main>
  );
}
