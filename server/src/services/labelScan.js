/**
 * Label-scan verification (Sprint 9, TC-01/TC-02).
 *
 * The medicine name comes from an on-device ML Kit text scan (medicine labels
 * only) — the OCR runs on the phone, never here. This module answers one
 * question: does a scanned name match one of the patient's active medications?
 *
 *   TC-01 (unreadable label): the client extracts nothing → it prompts MANUAL
 *          logging; this endpoint is simply not called (no unverified entry).
 *   TC-02 (name mismatch): a recognized name that matches no active medication
 *          returns match:false so the client warns and requires re-verification
 *          before any dose is recorded.
 */
import { pool } from '../db/connection.js';
import { canonicalName } from './formulary.js';

export async function verifyLabel(patientId, scannedName) {
  const scanned = canonicalName(scannedName);
  if (!scanned) return { match: false, reason: 'empty_scan' };

  const [rows] = await pool.execute(
    `SELECT m.id, m.drug_name_raw, dr.generic_name
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.patient_id = ? AND m.status = 'active'`,
    [patientId]
  );

  for (const m of rows) {
    if (canonicalName(m.drug_name_raw) === scanned || canonicalName(m.generic_name) === scanned) {
      return { match: true, medication_id: m.id, drug_name: m.drug_name_raw };
    }
  }
  return { match: false, reason: 'no_matching_medication' };
}
