import { downloadFile } from '../../api.js';

// Reports (D-6). CSV instruments for the pilot — adherence, dose logs, SUS, TAM.
// All keyed on patient_code only.
const REPORTS = [
  ['Adherence', '/api/admin/export/adherence.csv', 'adherence.csv'],
  ['Dose logs', '/api/admin/export/dose-logs.csv', 'dose-logs.csv'],
  ['SUS responses', '/api/admin/export/surveys.csv?instrument=sus', 'sus.csv'],
  ['TAM responses', '/api/admin/export/surveys.csv?instrument=tam', 'tam.csv'],
];

export default function Reports() {
  return (
    <>
      <h2 className="h4 fw-bold mb-1">Reports</h2>
      <p className="text-muted">
        Export the pilot instruments as CSV — patient codes only, no names.
      </p>

      <div className="row g-3">
        {REPORTS.map(([label, path, file]) => (
          <div className="col-md-6 col-lg-3" key={file}>
            <div className="pw-card p-3 text-center h-100 d-flex flex-column justify-content-between">
              <div className="fw-semibold mb-3">{label}</div>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => downloadFile(path, file)}
              >
                Download CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
