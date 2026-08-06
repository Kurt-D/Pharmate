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

export async function createRefill(patientId, { medication_id, branch_id, notes = null }) {
  if (!branch_id) return { error: 'branch_required' };
  if (!medication_id) return { error: 'medication_not_found' };
  const gate = await assertDispensable(patientId, medication_id); // UC-09
  if (gate.error) return gate;
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
  if (!medication_id) return { error: 'medication_not_found' };
  const gate = await assertDispensable(patientId, medication_id); // UC-09
  if (gate.error) return gate;
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
  // rx_class + source let the client group history under the OTC / Prescription
  // tabs (fall back to source when the drug is uncurated).
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at, m.drug_name_raw AS drug, m.source,
            dr.rx_class, b.name AS branch
     FROM refill_requests r
     JOIN medications m ON m.id = r.medication_id
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     JOIN pharmacy_branches b ON b.id = r.branch_id
     WHERE r.patient_id = ? ORDER BY r.requested_at DESC`,
    [patientId]
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at, m.drug_name_raw AS drug, m.source,
            dr.rx_class, b.name AS branch
     FROM delivery_requests d
     JOIN medications m ON m.id = d.medication_id
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
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
