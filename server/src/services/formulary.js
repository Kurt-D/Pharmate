/**
 * Formulary service (Sprint 3) — shared drug lookup used by the encode flow and
 * the pharmacist curation queue. Keeps restricted-substance and drug-resolution
 * logic in one place so both the patient and pharmacist encode paths behave
 * identically (TC-11, D-D).
 */
import { pool } from '../db/connection.js';

/** Normalize a typed drug name for matching: trim, drop parentheticals, lowercase. */
export function canonicalName(raw) {
  if (!raw) return '';
  return raw
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Is this drug on the restricted list? Matches on canonical generic name.
 * @returns {Promise<Object|null>} the restricted row, or null.
 */
export async function findRestricted(name) {
  const canonical = canonicalName(name);
  if (!canonical) return null;
  const [rows] = await pool.execute(
    'SELECT id, generic_name, category, reason FROM restricted_substances WHERE generic_name = ?',
    [canonical]
  );
  return rows[0] ?? null;
}

/**
 * Resolve a typed drug name to a curated drug_reference row.
 * @returns {Promise<Object|null>} the drug row, or null if uncurated.
 */
export async function resolveDrug(name) {
  const canonical = canonicalName(name);
  if (!canonical) return null;
  const [rows] = await pool.execute(
    'SELECT * FROM drug_reference WHERE generic_name = ? ORDER BY is_provisional ASC, created_at ASC LIMIT 1',
    [canonical]
  );
  return rows[0] ?? null;
}

/** Type-ahead search over curated drugs (generic name or brand). */
export async function searchDrugs(query, limit = 20) {
  const q = `%${String(query ?? '')
    .trim()
    .toLowerCase()}%`;
  // LIMIT cannot be a bound parameter in a mysql2 prepared statement; clamp to a
  // safe integer and inline it.
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const [rows] = await pool.execute(
    `SELECT id, generic_name, brand_names_json, min_interval_hours, max_daily_doses,
            is_prn_default, default_interval_hours, meal_anchor_code, is_restricted, is_provisional
     FROM drug_reference
     WHERE LOWER(generic_name) LIKE ? OR LOWER(brand_names_json) LIKE ?
     ORDER BY generic_name
     LIMIT ${safeLimit}`,
    [q, q]
  );
  return rows;
}
