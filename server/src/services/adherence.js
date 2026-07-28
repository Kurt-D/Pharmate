/**
 * Adherence computation + CSV export (Sprint 7, D-6 — the pilot instrument).
 *
 * Adherence rate = (taken + taken_late) ÷ scheduled over a window. Streak = the
 * number of most-recent acted doses taken in a row (a missed dose breaks it;
 * still-scheduled future doses are ignored). All exports key on patient_code —
 * never a name or condition (TC-05).
 */
import { pool } from '../db/connection.js';

const TAKEN = new Set(['taken', 'taken_late']);

/**
 * @param {string} patientId
 * @param {{from?:string,to?:string}} [window]  optional scheduled_time bounds (wall-clock)
 */
export async function computeAdherence(patientId, window = {}) {
  const params = [patientId];
  let where = 'patient_id = ?';
  if (window.from) {
    where += ' AND scheduled_time >= ?';
    params.push(window.from);
  }
  if (window.to) {
    where += ' AND scheduled_time < ?';
    params.push(window.to);
  }
  const [rows] = await pool.execute(
    `SELECT status FROM medication_schedules WHERE ${where} ORDER BY scheduled_time ASC`,
    params
  );

  const scheduled = rows.length;
  const taken = rows.filter((r) => TAKEN.has(r.status)).length;
  const takenLate = rows.filter((r) => r.status === 'taken_late').length;
  const missed = rows.filter((r) => r.status === 'missed').length;

  // Streak: walk the acted doses (ignore future 'scheduled') from newest back.
  const acted = rows.filter((r) => r.status !== 'scheduled');
  let streak = 0;
  for (let i = acted.length - 1; i >= 0; i--) {
    if (TAKEN.has(acted[i].status)) streak++;
    else break;
  }

  return {
    scheduled,
    taken,
    taken_late: takenLate,
    missed,
    adherence_rate: scheduled ? taken / scheduled : null,
    streak,
  };
}

/**
 * Loyalty-discount flag derived purely from the adherence streak (Sprint 9).
 * Sales-side only: this returns a tier the pharmacy can honor at the counter —
 * NO purchase-identity record is created or stored anywhere (D-4 spirit).
 */
export async function loyaltyFor(patientId) {
  const { streak } = await computeAdherence(patientId);
  let tier = 'none';
  if (streak >= 14) tier = 'gold';
  else if (streak >= 7) tier = 'silver';
  return { streak, tier };
}

/** Per-patient adherence rows for the CSV export (patient_code only). */
export async function adherenceReport() {
  const [patients] = await pool.execute(
    'SELECT id, patient_code FROM patients ORDER BY patient_code'
  );
  const out = [];
  for (const p of patients) {
    const a = await computeAdherence(p.id);
    out.push({
      patient_code: p.patient_code,
      scheduled: a.scheduled,
      taken: a.taken,
      taken_late: a.taken_late,
      missed: a.missed,
      adherence_pct: a.adherence_rate == null ? '' : (a.adherence_rate * 100).toFixed(1),
      streak: a.streak,
    });
  }
  return out;
}

/** Dose-log rows for the CSV export (patient_code + drug, no PII). */
export async function doseLogReport() {
  const [rows] = await pool.execute(
    `SELECT p.patient_code, m.drug_name_raw AS drug, ms.scheduled_time,
            dl.logged_at, dl.status, dl.confirmation_method
     FROM dose_logs dl
     JOIN medication_schedules ms ON ms.id = dl.schedule_id
     JOIN medications m ON m.id = ms.medication_id
     JOIN patients p ON p.id = dl.patient_id
     ORDER BY dl.logged_at ASC`
  );
  return rows;
}

/** RFC-4180-ish CSV serialization from an ordered header list. */
export function toCsv(headers, records) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of records) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n') + '\n';
}
