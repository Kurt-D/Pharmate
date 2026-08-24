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
  const [exactRows] = await pool.execute(
    'SELECT * FROM drug_reference WHERE generic_name = ? ORDER BY is_provisional ASC, created_at ASC LIMIT 1',
    [canonical]
  );
  if (exactRows[0]) return exactRows[0];

  // Accept a shortened generic name only when it identifies exactly one
  // verified formulary entry (for example "metoprolol" → "metoprolol
  // succinate"). Ambiguous names remain in pharmacist curation.
  const [prefixRows] = await pool.execute(
    `SELECT * FROM drug_reference
     WHERE generic_name LIKE ? AND is_provisional = 0
     ORDER BY created_at ASC LIMIT 2`,
    [`${canonical} %`]
  );
  return prefixRows.length === 1 ? prefixRows[0] : null;
}

/** Type-ahead search over curated drugs (generic name or brand). */
export async function searchDrugs(query, limit = 20, filters = {}) {
  const q = `%${String(query ?? '')
    .trim()
    .toLowerCase()}%`;
  // LIMIT cannot be a bound parameter in a mysql2 prepared statement; clamp to a
  // safe integer and inline it.
  // The patient catalog currently contains a few hundred entries. Keep a hard
  // ceiling to prevent unbounded responses while allowing the complete catalog.
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
  const conditions = ['(LOWER(dr.generic_name) LIKE ? OR LOWER(dr.brand_names_json) LIKE ?)'];
  const params = [q, q];
  if (filters.rxClass === 'RX' || filters.rxClass === 'OTC') {
    conditions.push('dr.rx_class = ?');
    params.push(filters.rxClass);
  }
  if (filters.category) {
    conditions.push('dr.therapeutic_category = ?');
    params.push(filters.category);
  }
  const [rows] = await pool.execute(
    `SELECT id, generic_name, brand_names_json, min_interval_hours, max_daily_doses,
            is_prn_default, default_interval_hours, meal_anchor_code, is_restricted,
            rx_class, is_provisional, therapeutic_category, drug_class, common_uses,
            short_description, common_strength, dosage_form
     FROM (
       SELECT dr.*,
              ROW_NUMBER() OVER (
                PARTITION BY LOWER(TRIM(dr.generic_name))
                ORDER BY dr.is_provisional ASC, dr.created_at ASC, dr.id ASC
              ) AS name_rank
       FROM drug_reference dr
       WHERE ${conditions.join(' AND ')}
     ) ranked
     WHERE name_rank=1
     ORDER BY
       CASE WHEN LOWER(generic_name) = ? THEN 0
            WHEN LOWER(generic_name) LIKE ? THEN 1 ELSE 2 END,
       generic_name
     LIMIT ${safeLimit}`,
    [
      ...params,
      String(query ?? '')
        .trim()
        .toLowerCase(),
      `${String(query ?? '')
        .trim()
        .toLowerCase()}%`,
    ]
  );
  return rows;
}
