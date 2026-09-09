import CaregiverMedicineCalendar from './CaregiverMedicineCalendar.jsx';
import '../../styles/caregiver-summary.css';

export default function CaregiverMedication({ patientCode, patientLabel, refreshKey }) {
  return (
    <main className="cg-medication-screen">
      <header>
        <p>LINKED PATIENT · READ-ONLY</p>
        <h1>Medicine tracking</h1>
        <p>
          {patientLabel || 'Select a linked patient'} — follow scheduled doses and recorded
          activity.
        </p>
      </header>
      {patientCode ? (
        <CaregiverMedicineCalendar
          key={patientCode}
          patientCode={patientCode}
          refreshKey={refreshKey}
        />
      ) : (
        <p>Link a patient to view their medicine calendar.</p>
      )}
    </main>
  );
}
