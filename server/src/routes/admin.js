/**
 * Admin routes (Sprint 7, D-5). Aggregate dashboard + CSV instruments.
 *
 * TC-05: nothing here exposes an individual name, condition, or clinical record —
 * only counts, throughput, anonymized adherence aggregates, and generic-drug
 * availability. CSV exports key on patient_code only.
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { adherenceReport, doseLogReport, toCsv } from '../services/adherence.js';
import { updateOrderStatus } from '../services/orders.js';
import { recordAudit } from '../services/audit.js';
import { orderChanged } from '../services/domainEvents.js';
import { publishRole, publishUser } from '../services/realtimeEvents.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// Privacy-safe immutable activity feed. Metadata must contain identifiers and
// operational state only; patient names, diagnoses and prescription content are
// deliberately never selected here.
router.get('/audit-events', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const [rows] = await pool.execute(
    `SELECT ae.id, ae.actor_role, ae.action, ae.entity_type, ae.entity_id,
            ae.metadata_json, ae.created_at, p.patient_code
     FROM audit_events ae
     LEFT JOIN patients p ON p.id = ae.patient_id
     ORDER BY ae.created_at DESC LIMIT ?`,
    [limit]
  );
  res.json(
    rows.map((row) => ({
      ...row,
      metadata:
        typeof row.metadata_json === 'string'
          ? JSON.parse(row.metadata_json || '{}')
          : row.metadata_json || {},
      metadata_json: undefined,
    }))
  );
});

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
    `SELECT id, generic_name, common_strength, dosage_form, short_description,
            rx_class, availability, stock_quantity, is_restricted, is_provisional
     FROM drug_reference ORDER BY generic_name`
  );
  res.json(rows);
});

// ── POST /api/admin/medicines ────────────────────────────────────────────────
router.post('/medicines', async (req, res) => {
  const genericName = String(req.body?.generic_name || '').trim();
  const strength = String(req.body?.common_strength || '').trim();
  const form = String(req.body?.dosage_form || '').trim();
  const description = String(req.body?.short_description || '').trim();
  const rxClass = req.body?.rx_class === 'OTC' ? 'OTC' : 'RX';
  const stock = Number(req.body?.stock_quantity);
  if (!genericName || !strength || !form || !description) {
    return res.status(400).json({ error: 'Name, strength, form, and description are required' });
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return res.status(400).json({ error: 'Stock must be a whole number between 0 and 1,000,000' });
  }
  const [[duplicate]] = await pool.execute(
    'SELECT id FROM drug_reference WHERE LOWER(generic_name) = LOWER(?) AND common_strength = ? LIMIT 1',
    [genericName, strength]
  );
  if (duplicate) return res.status(409).json({ error: 'This medicine and strength already exist' });
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO drug_reference
       (id, generic_name, common_strength, dosage_form, short_description,
        rx_class, availability, stock_quantity, is_provisional)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, genericName, strength, form, description, rxClass, stock > 0 ? 1 : 0, stock]
  );
  await pool.execute(
    `INSERT INTO medication_rule_variants
       (id,drug_id,strength,dosage_form,schedule_rule_status,rule_version)
     VALUES (?,?,?,?, 'UNVERIFIED',1)`,
    [uuidv4(), id, strength, form]
  );
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_MEDICINE_CREATED',
    entityType: 'drug_reference',
    entityId: id,
    metadata: { generic_name: genericName },
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', { action: 'created', drug_id: id });
  res.status(201).json({ id });
});

// ── PUT /api/admin/medicines/:id ─────────────────────────────────────────────
router.put('/medicines/:id', async (req, res) => {
  const genericName = String(req.body?.generic_name || '').trim();
  const strength = String(req.body?.common_strength || '').trim();
  const form = String(req.body?.dosage_form || '').trim();
  const description = String(req.body?.short_description || '').trim();
  const rxClass = req.body?.rx_class === 'OTC' ? 'OTC' : 'RX';
  const stock = Number(req.body?.stock_quantity);
  if (!genericName || !strength || !form || !description) {
    return res.status(400).json({ error: 'Name, strength, form, and description are required' });
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return res.status(400).json({ error: 'Stock must be a whole number between 0 and 1,000,000' });
  }
  const [result] = await pool.execute(
    `UPDATE drug_reference
     SET generic_name = ?, common_strength = ?, dosage_form = ?, short_description = ?,
         rx_class = ?, stock_quantity = ?, availability = ?
     WHERE id = ?`,
    [genericName, strength, form, description, rxClass, stock, stock > 0 ? 1 : 0, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Medicine not found' });
  await pool.execute(
    `UPDATE medication_rule_variants SET strength=?,dosage_form=?,schedule_rule_status='UNVERIFIED'
     WHERE drug_id=?`,
    [strength, form, req.params.id]
  );
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_MEDICINE_UPDATED',
    entityType: 'drug_reference',
    entityId: req.params.id,
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', { action: 'updated', drug_id: req.params.id });
  res.json({ id: req.params.id });
});

// Delete only unused references; patient medication history must never be erased.
router.delete('/medicines/:id', async (req, res) => {
  const [[usage]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM medications WHERE drug_id = ?',
    [req.params.id]
  );
  if (Number(usage.count) > 0) {
    return res.status(409).json({
      error: 'This medicine is in use and cannot be deleted. Set its stock to 0 instead.',
    });
  }
  const [result] = await pool.execute('DELETE FROM drug_reference WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Medicine not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_MEDICINE_DELETED',
    entityType: 'drug_reference',
    entityId: req.params.id,
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', { action: 'deleted', drug_id: req.params.id });
  res.status(204).end();
});

// ── PUT /api/admin/medicines/:id/availability ─────────────────────────────────
router.put('/medicines/:id/availability', async (req, res) => {
  const available = req.body?.available ? 1 : 0;
  const [r] = await pool.execute('UPDATE drug_reference SET availability = ? WHERE id = ?', [
    available,
    req.params.id,
  ]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Medicine not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_AVAILABILITY_UPDATED',
    entityType: 'drug_reference',
    entityId: req.params.id,
    metadata: { availability: Boolean(available) },
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', {
    action: 'availability',
    drug_id: req.params.id,
    availability: Boolean(available),
  });
  publishRole('admin', 'INVENTORY_UPDATED', {
    drug_id: req.params.id,
    availability: Boolean(available),
  });
  publishRole('pharmacist', 'INVENTORY_UPDATED', {
    drug_id: req.params.id,
    availability: Boolean(available),
  });
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
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'USER_ACTIVE_STATUS_UPDATED',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { is_active: Boolean(active) },
  });
  publishUser(req.params.id, 'ACCOUNT_STATUS_CHANGED', { is_active: Boolean(active) });
  res.json({ id: req.params.id, is_active: active });
});

// ── GET /api/admin/orders ─────────────────────────────────────────────────────
// Orders management (Fig 53). No payment amount (D-4). Patient by code only.
router.get('/orders', async (_req, res) => {
  const [refills] = await pool.execute(
    `SELECT r.id, 'refill' AS kind, r.status, r.requested_at, r.updated_at,
            p.patient_code, m.drug_name_raw AS drug, m.source, dr.rx_class,
            b.name AS branch
     FROM refill_requests r JOIN patients p ON p.id = r.patient_id
     JOIN medications m ON m.id = r.medication_id
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     JOIN pharmacy_branches b ON b.id = r.branch_id
     ORDER BY r.requested_at DESC LIMIT 100`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, 'delivery' AS kind, d.status, d.requested_at, d.updated_at,
            p.patient_code, m.drug_name_raw AS drug, m.source, dr.rx_class,
            b.name AS branch
     FROM delivery_requests d JOIN patients p ON p.id = d.patient_id
     JOIN medications m ON m.id = d.medication_id
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     JOIN pharmacy_branches b ON b.id = d.branch_id
     ORDER BY d.requested_at DESC LIMIT 100`
  );
  const all = [...refills, ...deliveries].sort(
    (a, b) => new Date(b.requested_at) - new Date(a.requested_at)
  );
  const counts = {
    total: all.length,
    pending: 0,
    processing: 0,
    ready: 0,
    out_for_delivery: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const o of all) {
    if (Object.hasOwn(counts, o.status)) counts[o.status]++;
    if (o.status === 'delivered' || o.status === 'ready') counts.completed++;
  }
  res.json({ counts, orders: all.slice(0, 100) });
});

// ── POST /api/admin/orders/:kind/:id/status ──────────────────────────────────
// Admins coordinate fulfilment, but cannot skip or reverse operational stages.
// Prescription approval remains in the pharmacist validation workspace; an Rx
// request can only exist here after the service-level prescription gate passes.
router.post('/orders/:kind/:id/status', async (req, res) => {
  const { kind, id } = req.params;
  if (!['refill', 'delivery'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be refill or delivery' });
  }

  const table = kind === 'delivery' ? 'delivery_requests' : 'refill_requests';
  const [[order]] = await pool.execute(`SELECT status, patient_id FROM ${table} WHERE id = ?`, [
    id,
  ]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const requestedStatus = String(req.body?.status || '');
  const transitions =
    kind === 'delivery'
      ? {
          pending: ['processing', 'cancelled'],
          processing: ['out_for_delivery', 'cancelled'],
          out_for_delivery: ['delivered', 'cancelled'],
        }
      : {
          pending: ['processing', 'cancelled'],
          processing: ['ready', 'cancelled'],
        };
  if (!(transitions[order.status] || []).includes(requestedStatus)) {
    return res.status(409).json({
      error: `Cannot move a ${kind} order from ${order.status} to ${requestedStatus}`,
    });
  }

  const result = await updateOrderStatus(kind, id, requestedStatus);
  if (result.error === 'bad_status') return res.status(400).json({ error: 'Invalid status' });
  if (result.error === 'not_found') return res.status(404).json({ error: 'Order not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'ORDER_STATUS_UPDATED',
    entityType: `${kind}_order`,
    entityId: id,
    patientId: order.patient_id,
    metadata: { from: order.status, to: requestedStatus },
  });
  await orderChanged({ patientId: order.patient_id, kind, orderId: id, status: requestedStatus });
  res.json(result);
});

// ── GET /api/admin/alerts ─────────────────────────────────────────────────────
// Unified, privacy-safe operations feed. It combines adherence, fulfilment,
// inventory, prescription, and account conditions without exposing names,
// diagnoses, addresses, or prescription images.
router.get('/alerts', async (_req, res) => {
  const [adherence] = await pool.execute(
    `SELECT ca.id, ca.channel, ca.status, ca.created_at, p.patient_code,
            m.drug_name_raw AS drug, ms.scheduled_time
     FROM caregiver_alerts ca JOIN patients p ON p.id = ca.patient_id
     LEFT JOIN medication_schedules ms ON ms.id = ca.schedule_id
     LEFT JOIN medications m ON m.id = ms.medication_id
     ORDER BY ca.created_at DESC LIMIT 100`
  );
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at AS created_at, p.patient_code,
            m.drug_name_raw AS drug
     FROM refill_requests r JOIN patients p ON p.id = r.patient_id
     JOIN medications m ON m.id = r.medication_id
     WHERE r.status IN ('pending','processing') ORDER BY r.requested_at DESC LIMIT 50`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at AS created_at, p.patient_code,
            m.drug_name_raw AS drug
     FROM delivery_requests d JOIN patients p ON p.id = d.patient_id
     JOIN medications m ON m.id = d.medication_id
     WHERE d.status IN ('pending','processing','out_for_delivery')
     ORDER BY d.requested_at DESC LIMIT 50`
  );
  const [inventory] = await pool.execute(
    `SELECT id, generic_name, stock_quantity, created_at
     FROM drug_reference WHERE stock_quantity <= 10
     ORDER BY stock_quantity ASC, generic_name LIMIT 50`
  );
  const [prescriptions] = await pool.execute(
    `SELECT pp.id, pp.status, pp.created_at, p.patient_code, m.drug_name_raw AS drug
     FROM prescription_photos pp JOIN medications m ON m.id = pp.medication_id
     JOIN patients p ON p.id = m.patient_id
     WHERE pp.status IN ('pending','needs_clearer')
     ORDER BY pp.created_at DESC LIMIT 50`
  );
  const [[accounts]] = await pool.execute(
    `SELECT COUNT(*) AS count, MAX(created_at) AS created_at
     FROM users WHERE is_active = 0`
  );

  const now = Date.now();
  const ageSeverity = (createdAt, warningHours = 24) =>
    now - new Date(createdAt).getTime() >= warningHours * 3600000 ? 'critical' : 'warning';
  const alerts = [
    ...adherence.map((row) => ({
      id: `adherence:${row.id}`,
      type: 'adherence',
      severity: row.status === 'unseen' ? 'critical' : 'info',
      title: `${row.patient_code} missed ${row.drug || 'a scheduled dose'}`,
      description: `Follow-up is assigned to the ${row.channel} channel.`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/alerts',
    })),
    ...refills.map((row) => ({
      id: `refill:${row.id}`,
      type: 'order',
      severity: ageSeverity(row.created_at),
      title: `${row.status === 'pending' ? 'Refill waiting for acceptance' : 'Refill being prepared'}`,
      description: `${row.patient_code} · ${row.drug}`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/orders',
    })),
    ...deliveries.map((row) => ({
      id: `delivery:${row.id}`,
      type: 'order',
      severity: ageSeverity(row.created_at),
      title:
        row.status === 'out_for_delivery'
          ? 'Delivery currently in transit'
          : 'Delivery requires processing',
      description: `${row.patient_code} · ${row.drug}`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/orders',
    })),
    ...inventory.map((row) => ({
      id: `inventory:${row.id}`,
      type: 'inventory',
      severity: Number(row.stock_quantity) === 0 ? 'critical' : 'warning',
      title:
        Number(row.stock_quantity) === 0
          ? `${row.generic_name} is out of stock`
          : `${row.generic_name} is running low`,
      description: `${Number(row.stock_quantity)} units currently available.`,
      status: Number(row.stock_quantity) === 0 ? 'out_of_stock' : 'low_stock',
      created_at: row.created_at,
      navigate_to: '/admin/medicines',
    })),
    ...prescriptions.map((row) => ({
      id: `prescription:${row.id}`,
      type: 'prescription',
      severity: row.status === 'needs_clearer' ? 'critical' : ageSeverity(row.created_at, 12),
      title:
        row.status === 'needs_clearer'
          ? 'Prescription needs patient resubmission'
          : 'Prescription awaiting pharmacist review',
      description: `${row.patient_code} · ${row.drug}`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/alerts',
    })),
  ];
  if (Number(accounts.count) > 0) {
    alerts.push({
      id: 'accounts:inactive',
      type: 'account',
      severity: 'info',
      title: `${Number(accounts.count)} inactive account${Number(accounts.count) === 1 ? '' : 's'}`,
      description: 'Review account status in User Management.',
      status: 'inactive',
      created_at: accounts.created_at || new Date(),
      navigate_to: '/admin/users',
    });
  }
  alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const counts = alerts.reduce(
    (result, alert) => {
      result.total += 1;
      result[alert.severity] = (result[alert.severity] || 0) + 1;
      result[alert.type] = (result[alert.type] || 0) + 1;
      return result;
    },
    { total: 0, critical: 0, warning: 0, info: 0 }
  );
  res.json({ counts, alerts: alerts.slice(0, 200) });
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
// Priority-token overview (PART 3, PART 4 flag 4): AGGREGATE COUNTS ONLY. Admin
// never sees a per-patient priority list or any clinical reason column — that is
// the pharmacist's ID-only roster, not the admin's. Priority is the boolean
// priority_flag derived from prescription validation (PART 2).
router.get('/priority', async (_req, res) => {
  const [[c]] = await pool.execute(
    `SELECT SUM(priority_flag = 1) AS priority,
            SUM(priority_flag = 0) AS standard,
            COUNT(*)              AS total
     FROM patients`
  );
  const [[chats]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(priority = 'high' AND status = 'open') AS priority_open,
            SUM(priority = 'high') AS priority_total,
            SUM(priority = 'normal' AND status = 'open') AS standard_open
     FROM inquiry_threads`
  );
  const [activity] = await pool.execute(
    `SELECT DATE(opened_at) AS date,
            SUM(priority = 'high') AS priority,
            SUM(priority = 'normal') AS standard
     FROM inquiry_threads
     WHERE opened_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(opened_at) ORDER BY date`
  );
  res.json({
    priority: Number(c.priority ?? 0),
    standard: Number(c.standard ?? 0),
    total: Number(c.total ?? 0),
    chats: {
      total: Number(chats.total ?? 0),
      priority_open: Number(chats.priority_open ?? 0),
      priority_total: Number(chats.priority_total ?? 0),
      standard_open: Number(chats.standard_open ?? 0),
    },
    activity: activity.map((row) => ({
      date: row.date,
      priority: Number(row.priority ?? 0),
      standard: Number(row.standard ?? 0),
    })),
    reward_policy: [
      { day: 3, tokens: 1 },
      { day: 6, tokens: 1 },
      { day: 7, tokens: 2 },
    ],
  });
});

export default router;
