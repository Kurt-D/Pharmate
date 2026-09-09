import { useEffect, useState } from 'react';
import { adminRead } from '../../lib/adminRead.js';
import '../../styles/counseling.css';

function Metric({ label, value, suffix = '' }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value == null ? 'Not measured' : `${value}${suffix}`}</strong>
    </article>
  );
}

export default function OcrValidation() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    adminRead('/api/admin/ocr-validation')
      .then((response) => {
        if (
          !response.data?.summary ||
          !Array.isArray(response.data.quality) ||
          !Array.isArray(response.data.devices)
        ) {
          throw new Error('The server returned an invalid validation report. Please try again.');
        }
        if (active) setReport(response.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  if (error)
    return (
      <div className="alert alert-warning" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          Try again
        </button>
      </div>
    );
  if (!report) return <div className="admin-ocr-loading">Loading validation measurements…</div>;
  const summary = report.summary;
  return (
    <main className="admin-ocr-validation">
      {!report.measured && (
        <div className="admin-ocr-empty">
          <strong>Accuracy has not been measured yet.</strong>
          <p>
            Run the installed Android app against labeled Philippine medicine packages. Percentages
            remain blank until a person confirms the ground-truth name, strength, and formulation.
          </p>
        </div>
      )}
      <section className="admin-ocr-metrics">
        <Metric label="Confirmed package runs" value={summary.measured_runs} />
        <Metric label="Product-field accuracy" value={summary.field_accuracy_pct} suffix="%" />
        <Metric label="Medicine-name accuracy" value={summary.name_accuracy_pct} suffix="%" />
        <Metric label="Strength accuracy" value={summary.strength_accuracy_pct} suffix="%" />
        <Metric label="Formulation accuracy" value={summary.formulation_accuracy_pct} suffix="%" />
        <Metric label="Offline runs" value={summary.offline_runs} />
      </section>
      <section className="admin-ocr-panel">
        <header>
          <div>
            <h2>Quality handling</h2>
            <p>Google ML Kit confidence gate: {Math.round(report.confidence_threshold * 100)}%</p>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Image result</th>
              <th>Runs</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {report.quality.length === 0 ? (
              <tr>
                <td colSpan="3">No measurements yet.</td>
              </tr>
            ) : (
              report.quality.map((row) => (
                <tr key={row.image_quality}>
                  <td>{row.image_quality.replaceAll('_', ' ')}</td>
                  <td>{row.runs}</td>
                  <td>{row.accuracy_pct == null ? '—' : `${row.accuracy_pct}%`}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <section className="admin-ocr-panel">
        <header>
          <div>
            <h2>Offline device matrix</h2>
            <p>Processing time and accuracy by actual device.</p>
          </div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Platform / device</th>
              <th>Runs offline</th>
              <th>Accuracy</th>
              <th>Average time</th>
            </tr>
          </thead>
          <tbody>
            {report.devices.length === 0 ? (
              <tr>
                <td colSpan="4">No device runs yet.</td>
              </tr>
            ) : (
              report.devices.map((row) => (
                <tr key={`${row.device_platform}:${row.device_model}`}>
                  <td>
                    {row.device_platform}
                    <small>{row.device_model}</small>
                  </td>
                  <td>
                    {row.offline_runs} / {row.runs}
                  </td>
                  <td>{row.accuracy_pct == null ? '—' : `${row.accuracy_pct}%`}</td>
                  <td>
                    {row.average_processing_ms == null ? '—' : `${row.average_processing_ms} ms`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <section className="admin-ocr-protocol">
        <h2>Required Philippine packaging test</h2>
        <ol>
          <li>
            Use real locally sold cartons, bottles, blister packs, sachets, and pharmacy labels
            across common generics and brands.
          </li>
          <li>Run clear, blurred, low-light, cropped, angled, and partially obscured captures.</li>
          <li>
            Confirm the printed medicine name, strength, and formulation manually after every usable
            scan.
          </li>
          <li>Repeat representative samples in airplane mode on each target Android device.</li>
          <li>
            Have a licensed pharmacist review the dataset and acceptance result before the scanner
            is used in a pilot.
          </li>
        </ol>
        <p>{report.methodology} No image is uploaded or retained.</p>
      </section>
    </main>
  );
}
