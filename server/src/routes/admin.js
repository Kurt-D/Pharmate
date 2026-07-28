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

export default router;
