/**
 * Refill & delivery requests (Sprint 9, Tier 2b, D-4, TC-08).
 *
 * Request + status tracking ONLY — there is no payment field, endpoint, or flow
 * anywhere (D-4). A delivery must name a branch and that branch must actually
 * offer delivery (coverage is limited to the selected branch, TC-08). The
 * delivery address is AES-encrypted at rest, like all patient PII.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { encrypt } from '../utils/crypto.js';

/** Confirm a medication belongs to the patient. */
async function ownsMedication(patientId, medicationId) {
  const [[m]] = await pool.execute('SELECT id FROM medications WHERE id = ? AND patient_id = ?', [
    medicationId,
    patientId,
  ]);
  return !!m;
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

export async function createRefill(patientId, { medication_id, branch_id, notes = null }) {
  if (!branch_id) return { error: 'branch_required' };
  if (!medication_id || !(await ownsMedication(patientId, medication_id))) {
    return { error: 'medication_not_found' };
  }
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO refill_requests (id, patient_id, medication_id, branch_id, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [id, patientId, medication_id, branch_id, notes]
  );
  return { id, status: 'pending' };
}

export async function createDelivery(
  patientId,
  { medication_id, branch_id, address, notes = null }
) {
  if (!branch_id) return { error: 'branch_required' }; // TC-08
  if (!medication_id || !(await ownsMedication(patientId, medication_id))) {
    return { error: 'medication_not_found' };
  }
  const branch = await branchDelivery(branch_id);
  if (!branch.exists) return { error: 'branch_not_found' };
  if (!branch.offersDelivery) return { error: 'no_delivery_coverage' }; // coverage limited to branch

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO delivery_requests
       (id, patient_id, medication_id, branch_id, delivery_address_enc, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, patientId, medication_id, branch_id, address ? encrypt(address) : null, notes]
  );
  return { id, status: 'pending' };
}

/** A patient's own requests (no decrypted address in the list). */
export async function listOrders(patientId) {
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at, m.drug_name_raw AS drug, b.name AS branch
     FROM refill_requests r
     JOIN medications m ON m.id = r.medication_id
     JOIN pharmacy_branches b ON b.id = r.branch_id
     WHERE r.patient_id = ? ORDER BY r.requested_at DESC`,
    [patientId]
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at, m.drug_name_raw AS drug, b.name AS branch
     FROM delivery_requests d
     JOIN medications m ON m.id = d.medication_id
     JOIN pharmacy_branches b ON b.id = d.branch_id
     WHERE d.patient_id = ? ORDER BY d.requested_at DESC`,
    [patientId]
  );
  return { refills, deliveries };
}

/** Pharmacist queue — by patient_code only, no PII, no address. */
export async function orderQueue() {
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at, p.patient_code, m.drug_name_raw AS drug
     FROM refill_requests r
     JOIN patients p ON p.id = r.patient_id
     JOIN medications m ON m.id = r.medication_id
     WHERE r.status IN ('pending','processing') ORDER BY r.requested_at ASC`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at, p.patient_code, m.drug_name_raw AS drug
     FROM delivery_requests d
     JOIN patients p ON p.id = d.patient_id
     JOIN medications m ON m.id = d.medication_id
     WHERE d.status IN ('pending','processing','out_for_delivery') ORDER BY d.requested_at ASC`
  );
  return { refills, deliveries };
}

const REFILL_STATUSES = ['pending', 'processing', 'ready', 'cancelled'];
const DELIVERY_STATUSES = ['pending', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];

export async function updateOrderStatus(kind, id, status) {
  const table = kind === 'delivery' ? 'delivery_requests' : 'refill_requests';
  const allowed = kind === 'delivery' ? DELIVERY_STATUSES : REFILL_STATUSES;
  if (!allowed.includes(status)) return { error: 'bad_status' };
  const [r] = await pool.execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, id]);
  if (r.affectedRows === 0) return { error: 'not_found' };
  return { id, status };
}
