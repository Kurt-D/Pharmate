/**
 * Admin routes (Sprint 7, D-5). Aggregate dashboard + CSV instruments.
 *
 * TC-05: nothing here exposes an individual name, condition, or clinical record —
 * only counts, throughput, anonymized adherence aggregates, and generic-drug
 * availability. CSV exports key on patient_code only.
 */
import { Router } from 'express';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { adherenceReport, doseLogReport, toCsv } from '../services/adherence.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function countByStatus(rows) {
  const out = {};
  for (const r of rows) out[r.status] = r.c;
  return out;
}

// ── GET /api/admin/aggregates ─────────────────────────────────────────────────
router.get('/aggregates', async (_req, res) => {
  const [[patients]] = await pool.execute('SELECT COUNT(*) AS c FROM patients');
  const [[meds]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM medications WHERE status = 'active'"
  );
  const [refills] = await pool.execute(
    'SELECT status, COUNT(*) AS c FROM refill_requests GROUP BY status'
  );
  const [deliveries] = await pool.execute(
    'SELECT status, COUNT(*) AS c FROM delivery_requests GROUP BY status'
  );
  const [[adh]] = await pool.execute(
    `SELECT COUNT(*) AS scheduled,
            SUM(status IN ('taken','taken_late')) AS taken,
            COUNT(DISTINCT patient_id) AS patients
     FROM medication_schedules`
  );
  const [[followups]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM caregiver_alerts WHERE channel = 'pharmacist' AND status = 'unseen'"
  );

  res.json({
    patients: patients.c,
    active_medications: meds.c,
    refills: countByStatus(refills),
    deliveries: countByStatus(deliveries),
    adherence: {
      scheduled: adh.scheduled,
      taken: Number(adh.taken ?? 0),
      average_pct: adh.scheduled
        ? Number(((Number(adh.taken ?? 0) / adh.scheduled) * 100).toFixed(1))
        : null,
      patients_measured: adh.patients,
    },
    no_caregiver_followups_open: followups.c,
  });
});

// ── GET /api/admin/medicines ──────────────────────────────────────────────────
// Generic-drug availability management (not PII).
router.get('/medicines', async (_req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, generic_name, availability, is_restricted FROM drug_reference ORDER BY generic_name'
  );
  res.json(rows);
});

// ── PUT /api/admin/medicines/:id/availability ─────────────────────────────────
router.put('/medicines/:id/availability', async (req, res) => {
  const available = req.body?.available ? 1 : 0;
  const [r] = await pool.execute('UPDATE drug_reference SET availability = ? WHERE id = ?', [
    available,
    req.params.id,
  ]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Medicine not found' });
  res.json({ id: req.params.id, availability: available });
});

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ── GET /api/admin/export/adherence.csv ───────────────────────────────────────
router.get('/export/adherence.csv', async (_req, res) => {
  const rows = await adherenceReport();
  const headers = [
    'patient_code',
    'scheduled',
    'taken',
    'taken_late',
    'missed',
    'adherence_pct',
    'streak',
  ];
  sendCsv(res, 'adherence.csv', toCsv(headers, rows));
});

// ── GET /api/admin/export/dose-logs.csv ───────────────────────────────────────
router.get('/export/dose-logs.csv', async (_req, res) => {
  const rows = await doseLogReport();
  const headers = [
    'patient_code',
    'drug',
    'scheduled_time',
    'logged_at',
    'status',
    'confirmation_method',
  ];
  sendCsv(res, 'dose-logs.csv', toCsv(headers, rows));
});

// ── GET /api/admin/export/surveys.csv?instrument=sus|tam ───────────────────────
router.get('/export/surveys.csv', async (req, res) => {
  const instrument = req.query.instrument === 'tam' ? 'tam' : 'sus';
  const table = instrument === 'tam' ? 'tam_responses' : 'sus_responses';
  const [rows] = await pool.execute(
    `SELECT id, role, responses_json, submitted_at FROM ${table} ORDER BY submitted_at ASC`
  );
  // Flatten responses_json into q-columns; union all keys for a stable header.
  const qKeys = new Set();
  const flat = rows.map((r) => {
    const answers =
      typeof r.responses_json === 'string' ? JSON.parse(r.responses_json) : r.responses_json;
    Object.keys(answers || {}).forEach((k) => qKeys.add(k));
    return { id: r.id, role: r.role, submitted_at: r.submitted_at, ...answers };
  });
  const headers = ['id', 'role', 'submitted_at', ...[...qKeys].sort()];
  sendCsv(res, `${instrument}.csv`, toCsv(headers, flat));
});

// ── GET /api/admin/users?role= ────────────────────────────────────────────────
// User management (Fig 51). Pseudonymous — patients by patient_code, staff by
// role; never a name (TC-05).
router.get('/users', async (req, res) => {
  const role = req.query.role;
  const params = [];
  let where = '';
  if (['patient', 'pharmacist', 'caregiver', 'admin'].includes(role)) {
    where = 'WHERE u.role = ?';
    params.push(role);
  }
  const [rows] = await pool.execute(
    `SELECT u.id, u.role, u.is_active, u.created_at, p.patient_code
     FROM users u LEFT JOIN patients p ON p.id = u.id
     ${where} ORDER BY u.created_at DESC LIMIT 200`,
    params
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      role: r.role,
      label: r.patient_code || `${r.role}-${String(r.id).slice(0, 8)}`,
      is_active: r.is_active,
      created_at: r.created_at,
    }))
  );
});

// ── PUT /api/admin/users/:id/active ───────────────────────────────────────────
router.put('/users/:id/active', async (req, res) => {
  const active = req.body?.active ? 1 : 0;
  const [r] = await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [
    active,
    req.params.id,
  ]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ id: req.params.id, is_active: active });
});

// ── GET /api/admin/orders ─────────────────────────────────────────────────────
// Orders management (Fig 53). No payment amount (D-4). Patient by code only.
router.get('/orders', async (_req, res) => {
  const [refills] = await pool.execute(
    `SELECT r.id, 'refill' AS kind, r.status, r.requested_at, p.patient_code, m.drug_name_raw AS drug
     FROM refill_requests r JOIN patients p ON p.id = r.patient_id
     JOIN medications m ON m.id = r.medication_id
     ORDER BY r.requested_at DESC LIMIT 100`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, 'delivery' AS kind, d.status, d.requested_at, p.patient_code, m.drug_name_raw AS drug
     FROM delivery_requests d JOIN patients p ON p.id = d.patient_id
     JOIN medications m ON m.id = d.medication_id
     ORDER BY d.requested_at DESC LIMIT 100`
  );
  const all = [...refills, ...deliveries].sort(
    (a, b) => new Date(b.requested_at) - new Date(a.requested_at)
  );
  const counts = { total: all.length, pending: 0, out_for_delivery: 0, delivered: 0 };
  for (const o of all) {
    if (o.status === 'pending') counts.pending++;
    if (o.status === 'out_for_delivery') counts.out_for_delivery++;
    if (o.status === 'delivered') counts.delivered++;
  }
  res.json({ counts, orders: all.slice(0, 100) });
});

// ── GET /api/admin/alerts ─────────────────────────────────────────────────────
// Missed-dose alerts (Fig 49-style). patient_code only, no PII.
router.get('/alerts', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT ca.id, ca.channel, ca.status, ca.created_at, p.patient_code,
            m.drug_name_raw AS drug, ms.scheduled_time
     FROM caregiver_alerts ca JOIN patients p ON p.id = ca.patient_id
     LEFT JOIN medication_schedules ms ON ms.id = ca.schedule_id
     LEFT JOIN medications m ON m.id = ms.medication_id
     ORDER BY ca.created_at DESC LIMIT 100`
  );
  res.json(rows);
});

// ── GET /api/admin/adherence-trend?days= ──────────────────────────────────────
// Per-day adherence for the dashboard chart (anonymized aggregate).
router.get('/adherence-trend', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
  const [rows] = await pool.execute(
    `SELECT DATE(scheduled_time) AS d, COUNT(*) AS scheduled,
            SUM(status IN ('taken','taken_late')) AS taken
     FROM medication_schedules
     GROUP BY DATE(scheduled_time) ORDER BY d DESC LIMIT ${days}`
  );
  res.json(
    rows.reverse().map((r) => ({
      date: r.d,
      pct: r.scheduled ? Math.round((Number(r.taken) / r.scheduled) * 100) : null,
    }))
  );
});

// ── GET /api/admin/priority ───────────────────────────────────────────────────
// Severity-based priority (B-8) — patients flagged by verified chronic severity,
// by patient_code. (Not a token issuance/expiry system; that GUI concept is not
// in the data model — see Limitations.)
router.get('/priority', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT patient_code, chronic_severity
     FROM patients WHERE chronic_severity IN ('moderate','high')
     ORDER BY FIELD(chronic_severity,'high','moderate'), patient_code LIMIT 100`
  );
  res.json(rows);
});

export default router;
