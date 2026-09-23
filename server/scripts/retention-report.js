import { pool } from '../src/db/connection.js';

// Read-only readiness report. Deletion requires the controls documented in
// docs/DATA_RETENTION_POLICY.md; this script is safe to schedule.
const checks = [
  ['prescription images past purge_at', 'SELECT COUNT(*) AS count FROM prescription_photos WHERE purge_at IS NOT NULL AND purge_at <= NOW(3)'],
  ['closed inquiry messages older than 90 days', 'SELECT COUNT(*) AS count FROM inquiry_messages m JOIN inquiry_threads t ON t.id=m.thread_id WHERE t.closed_at IS NOT NULL AND t.closed_at < DATE_SUB(NOW(3), INTERVAL 90 DAY)'],
  ['read patient notifications older than 90 days', 'SELECT COUNT(*) AS count FROM patient_notifications WHERE read_at IS NOT NULL AND read_at < DATE_SUB(NOW(3), INTERVAL 90 DAY)'],
  ['portal notifications older than 90 days', 'SELECT COUNT(*) AS count FROM portal_notifications WHERE created_at < DATE_SUB(NOW(3), INTERVAL 90 DAY)'],
  ['expired request-rate counters', 'SELECT COUNT(*) AS count FROM request_rate_limits WHERE reset_at <= NOW(3)'],
  ['audit records older than seven years (report only)', 'SELECT COUNT(*) AS count FROM audit_events WHERE created_at < DATE_SUB(NOW(3), INTERVAL 7 YEAR)'],
];

try {
  for (const [category, sql] of checks) {
    const [[row]] = await pool.execute(sql);
    console.log(JSON.stringify({ event: 'retention_report', category, eligible_count: Number(row.count) }));
  }
} finally {
  await pool.end();
}
