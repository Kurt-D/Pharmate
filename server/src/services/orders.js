/**
 * Refill & delivery requests (Sprint 9, Tier 2b, D-4, TC-08).
 *
 * Shared request, status-tracking, and payment-method metadata. No card or
 * wallet credentials are stored here. A delivery must name a branch and
 * offer delivery (coverage is limited to the selected branch, TC-08). The
 * delivery address is AES-encrypted at rest, like all patient PII.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { encrypt } from '../utils/crypto.js';

const PAYMENT_METHODS = new Set(['CASH_ON_PICKUP', 'COD', 'CARD', 'GCASH']);
function paymentMethod(value, fallback) {
  const method = String(value || fallback).toUpperCase();
  return PAYMENT_METHODS.has(method) ? method : null;
}

export async function createCatalogOrder(
  patientId,
  placedBy,
  {
    drug_id,
    branch_id,
    quantity,
    fulfillment = 'pickup',
    address = null,
    notes = null,
    payment_method,
  },
  prescriptionFilename = null
) {
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) return { error: 'invalid_quantity' };
  if (!branch_id) return { error: 'branch_required' };
  const [[drug]] = await pool.execute(
    `SELECT id,generic_name,rx_class,is_restricted,availability
     FROM drug_reference WHERE id=?`,
    [drug_id]
  );
  if (!drug || !drug.availability) return { error: 'drug_not_found' };
  if (drug.is_restricted) return { error: 'restricted', generic_name: drug.generic_name };
  if (drug.rx_class === 'RX' && !prescriptionFilename) return { error: 'prescription_required' };
  const delivery = fulfillment === 'delivery';
  if (!delivery && fulfillment !== 'pickup') return { error: 'invalid_fulfillment' };
  const branch = await branchDelivery(branch_id);
  if (!branch.exists) return { error: 'branch_not_found' };
  if (delivery && !branch.offersDelivery) return { error: 'no_delivery_coverage' };
  const payment = paymentMethod(payment_method, delivery ? 'COD' : 'CASH_ON_PICKUP');
  if (!payment || (delivery && payment === 'CASH_ON_PICKUP')) {
    return { error: 'invalid_payment_method' };
  }

  const id = uuidv4();
  const kind = delivery ? 'delivery' : 'refill';
  const table = delivery ? 'delivery_requests' : 'refill_requests';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (delivery) {
      await conn.execute(
        `INSERT INTO ${table}
           (id,patient_id,placed_by_user_id,caregiver_id,drug_id,quantity,branch_id,
            delivery_address_enc,notes,payment_method,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`,
        [
          id,
          patientId,
          placedBy.id,
          placedBy.role === 'caregiver' ? placedBy.id : null,
          drug.id,
          amount,
          branch_id,
          address ? encrypt(address) : null,
          notes,
          payment,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO ${table}
           (id,patient_id,placed_by_user_id,caregiver_id,drug_id,quantity,branch_id,
            notes,payment_method,status)
         VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
        [
          id,
          patientId,
          placedBy.id,
          placedBy.role === 'caregiver' ? placedBy.id : null,
          drug.id,
          amount,
          branch_id,
          notes,
          payment,
        ]
      );
    }
    if (prescriptionFilename) {
      await conn.execute(
        `INSERT INTO order_prescriptions
           (id,order_kind,order_id,patient_id,stored_filename) VALUES (?,?,?,?,?)`,
        [uuidv4(), kind, id, patientId, prescriptionFilename]
      );
    }
    await conn.execute(
      `INSERT INTO order_status_history
         (id,order_kind,order_id,from_status,to_status,changed_by,changed_by_role)
       VALUES (?,?,?,NULL,'pending',?,?)`,
      [uuidv4(), kind, id, placedBy.id, placedBy.role]
    );
    await conn.commit();
    return {
      id,
      order_id: id,
      kind,
      status: 'pending',
      patient_id: patientId,
      placed_by_role: placedBy.role,
      item: { medication_id: drug.id, name: drug.generic_name, quantity: amount },
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * UC-09 precondition + exceptions. Decide whether a refill/delivery may be
 * requested for one of the patient's medications:
 *   • medication not owned            → { error: 'medication_not_found' }
 *   • restricted / branch-verification → { error: 'restricted' } (TC-11: the
 *     patient must visit the nearest branch; never dispensed remotely)
 *   • OTC self-encoded                 → proceeds (no prescription needed)
 *   • prescription-required (RX)       → proceeds ONLY if a valid approved
 *     prescription is on record, else { error: 'no_valid_prescription' }
 *
 * "On record" = an 'approved' prescription_photos row for the med. That row
 * survives the 7-day image purge (only the file is removed), so it remains the
 * authoritative proof of a validated RX.
 */
async function assertDispensable(patientId, medicationId) {
  const [[m]] = await pool.execute(
    `SELECT m.id, m.source, m.drug_id, m.drug_name_raw,
            COALESCE(dr.is_restricted, 0) AS is_restricted, dr.rx_class
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.id = ? AND m.patient_id = ?`,
    [medicationId, patientId]
  );
  if (!m) return { error: 'medication_not_found' };

  // Restricted substances require in-person branch verification (TC-11).
  if (Number(m.is_restricted) === 1) {
    return { error: 'restricted', generic_name: m.drug_name_raw };
  }

  // Whether a prescription is required is a property of the DRUG (PH FDA
  // classification), which is authoritative over the patient's declared source.
  // For an uncurated drug (no formulary row) fall back to that declaration.
  const rxRequired = m.rx_class ? m.rx_class === 'RX' : m.source === 'RX_VALIDATED';
  if (!rxRequired) return { ok: true }; // OTC — proceeds

  // Prescription-required: require a valid approved prescription on record.
  const [[rx]] = await pool.execute(
    `SELECT 1 AS ok FROM prescription_photos
     WHERE medication_id = ? AND status = 'approved' LIMIT 1`,
    [medicationId]
  );
  if (!rx) return { error: 'no_valid_prescription' };
  return { ok: true };
}

/** Fetch an active branch and whether it offers delivery (services_json). */
async function branchDelivery(branchId) {
  const [[b]] = await pool.execute(
    'SELECT id, services_json FROM pharmacy_branches WHERE id = ? AND is_active = 1',
    [branchId]
  );
  if (!b) return { exists: false };
  let offersDelivery = true; // lenient when services aren't enumerated
  if (b.services_json) {
    const services =
      typeof b.services_json === 'string' ? JSON.parse(b.services_json) : b.services_json;
    offersDelivery = Array.isArray(services) ? services.includes('delivery') : true;
  }
  return { exists: true, offersDelivery };
}

export async function createRefill(
  patientId,
  { medication_id, branch_id, notes = null, payment_method }
) {
  if (!branch_id) return { error: 'branch_required' };
  if (!medication_id) return { error: 'medication_not_found' };
  const gate = await assertDispensable(patientId, medication_id); // UC-09
  if (gate.error) return gate;
  const payment = paymentMethod(payment_method, 'CASH_ON_PICKUP');
  if (!payment) return { error: 'invalid_payment_method' };
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO refill_requests (id, patient_id, medication_id, branch_id, notes, payment_method)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, patientId, medication_id, branch_id, notes, payment]
  );
  return { id, status: 'pending' };
}

export async function createDelivery(
  patientId,
  { medication_id, branch_id, address, notes = null, payment_method }
) {
  if (!branch_id) return { error: 'branch_required' }; // TC-08
  if (!medication_id) return { error: 'medication_not_found' };
  const gate = await assertDispensable(patientId, medication_id); // UC-09
  if (gate.error) return gate;
  const branch = await branchDelivery(branch_id);
  if (!branch.exists) return { error: 'branch_not_found' };
  if (!branch.offersDelivery) return { error: 'no_delivery_coverage' }; // coverage limited to branch
  const payment = paymentMethod(payment_method, 'COD');
  if (!payment || payment === 'CASH_ON_PICKUP') return { error: 'invalid_payment_method' };

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO delivery_requests
       (id, patient_id, medication_id, branch_id, delivery_address_enc, notes, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, patientId, medication_id, branch_id, address ? encrypt(address) : null, notes, payment]
  );
  return { id, status: 'pending' };
}

/** A patient's own requests (no decrypted address in the list). */
export async function listOrders(patientId) {
  // rx_class + source let the client group history under the OTC / Prescription
  // tabs (fall back to source when the drug is uncurated).
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at, r.updated_at, r.payment_method, r.payment_status,
            r.quantity, r.placed_by_user_id, r.caregiver_id,
            COALESCE(dr.generic_name,m.drug_name_raw) AS drug, m.source,
            COALESCE(dr.rx_class,mdr.rx_class) AS rx_class, b.name AS branch,
            op.id AS prescription_id, op.status AS prescription_status
     FROM refill_requests r
     LEFT JOIN medications m ON m.id = r.medication_id
     LEFT JOIN drug_reference mdr ON mdr.id = m.drug_id
     LEFT JOIN drug_reference dr ON dr.id = r.drug_id
     JOIN pharmacy_branches b ON b.id = r.branch_id
     LEFT JOIN order_prescriptions op ON op.order_kind='refill' AND op.order_id=r.id
     WHERE r.patient_id = ? ORDER BY r.requested_at DESC`,
    [patientId]
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at, d.updated_at, d.payment_method, d.payment_status,
            d.quantity, d.placed_by_user_id, d.caregiver_id,
            COALESCE(dr.generic_name,m.drug_name_raw) AS drug, m.source,
            COALESCE(dr.rx_class,mdr.rx_class) AS rx_class, b.name AS branch,
            op.id AS prescription_id, op.status AS prescription_status
     FROM delivery_requests d
     LEFT JOIN medications m ON m.id = d.medication_id
     LEFT JOIN drug_reference mdr ON mdr.id = m.drug_id
     LEFT JOIN drug_reference dr ON dr.id = d.drug_id
     JOIN pharmacy_branches b ON b.id = d.branch_id
     LEFT JOIN order_prescriptions op ON op.order_kind='delivery' AND op.order_id=d.id
     WHERE d.patient_id = ? ORDER BY d.requested_at DESC`,
    [patientId]
  );
  return { refills, deliveries };
}

/** Pharmacist queue — by patient_code only, no PII, no address. */
export async function orderQueue() {
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at, r.payment_method, r.payment_status, r.quantity,
            p.patient_code, COALESCE(dr.generic_name,m.drug_name_raw) AS drug,
            op.id AS prescription_id, op.status AS prescription_status
     FROM refill_requests r
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN medications m ON m.id = r.medication_id
     LEFT JOIN drug_reference dr ON dr.id = r.drug_id
     LEFT JOIN order_prescriptions op ON op.order_kind='refill' AND op.order_id=r.id
     WHERE r.status IN ('pending','processing') ORDER BY r.requested_at ASC`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at, d.payment_method, d.payment_status, d.quantity,
            p.patient_code, COALESCE(dr.generic_name,m.drug_name_raw) AS drug,
            op.id AS prescription_id, op.status AS prescription_status
     FROM delivery_requests d
     JOIN patients p ON p.id = d.patient_id
     LEFT JOIN medications m ON m.id = d.medication_id
     LEFT JOIN drug_reference dr ON dr.id = d.drug_id
     LEFT JOIN order_prescriptions op ON op.order_kind='delivery' AND op.order_id=d.id
     WHERE d.status IN ('pending','processing','out_for_delivery') ORDER BY d.requested_at ASC`
  );
  return { refills, deliveries };
}

const REFILL_STATUSES = ['pending', 'processing', 'ready', 'cancelled'];
const DELIVERY_STATUSES = ['pending', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];

export async function updateOrderStatus(kind, id, status, actor = {}) {
  const table = kind === 'delivery' ? 'delivery_requests' : 'refill_requests';
  const allowed = kind === 'delivery' ? DELIVERY_STATUSES : REFILL_STATUSES;
  if (!allowed.includes(status)) return { error: 'bad_status' };
  const transitions =
    kind === 'delivery'
      ? {
          pending: ['processing', 'cancelled'],
          processing: ['out_for_delivery', 'cancelled'],
          out_for_delivery: ['delivered', 'cancelled'],
        }
      : { pending: ['processing', 'cancelled'], processing: ['ready', 'cancelled'] };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(`SELECT status FROM ${table} WHERE id=? FOR UPDATE`, [id]);
    if (!order) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (order.status === status) {
      await conn.rollback();
      return { id, status, idempotent: true };
    }
    if (!transitions[order.status]?.includes(status)) {
      await conn.rollback();
      return { error: 'invalid_transition', current_status: order.status };
    }
    await conn.execute(`UPDATE ${table} SET status=? WHERE id=?`, [status, id]);
    await conn.execute(
      `INSERT INTO order_status_history (id,order_kind,order_id,from_status,to_status,changed_by,changed_by_role) VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), kind, id, order.status, status, actor.id || null, actor.role || 'system']
    );
    await conn.commit();
    return { id, status, previous_status: order.status };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updatePaymentStatus(kind, id, paymentStatus) {
  if (!['refill', 'delivery'].includes(kind)) return { error: 'bad_kind' };
  const status = String(paymentStatus || '').toUpperCase();
  const transitions = {
    PENDING: ['AUTHORIZED', 'PAID', 'FAILED'],
    AUTHORIZED: ['PAID', 'FAILED'],
    PAID: ['REFUNDED'],
    FAILED: ['PENDING'],
    REFUNDED: [],
  };
  const table = kind === 'delivery' ? 'delivery_requests' : 'refill_requests';
  const [[order]] = await pool.execute(`SELECT payment_status FROM ${table} WHERE id=?`, [id]);
  if (!order) return { error: 'not_found' };
  if (order.payment_status === status) return { id, payment_status: status, idempotent: true };
  if (!transitions[order.payment_status]?.includes(status))
    return { error: 'invalid_payment_transition', current_status: order.payment_status };
  await pool.execute(`UPDATE ${table} SET payment_status=? WHERE id=?`, [status, id]);
  return { id, payment_status: status };
}

export async function orderHistory(patientId, kind, id) {
  if (!['refill', 'delivery'].includes(kind)) return { error: 'bad_kind' };
  const table = kind === 'delivery' ? 'delivery_requests' : 'refill_requests';
  const [[order]] = await pool.execute(`SELECT id FROM ${table} WHERE id=? AND patient_id=?`, [
    id,
    patientId,
  ]);
  if (!order) return { error: 'not_found' };
  const [history] = await pool.execute(
    `SELECT from_status, to_status, changed_by_role, changed_at
       FROM order_status_history WHERE order_kind=? AND order_id=? ORDER BY changed_at ASC`,
    [kind, id]
  );
  return { id, kind, history };
}
