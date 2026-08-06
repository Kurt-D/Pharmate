/**
 * Formulary seed loader (Sprint 3).
 *
 * Reads the pharmacist curation workbook (converted to /seeds/*_raw.json by
 * seeds/xlsx_to_json.py) and loads drug_reference, drug_interactions, and
 * restricted_substances.
 *
 * Signature guard (plan AC): the seed REJECTS unsigned rows (verified_by blank)
 * unless run with --allow-unverified, which loads them flagged is_provisional=1.
 * This is the R1 fallback: build proceeds now; the pharmacist's signatures later
 * simply flip is_provisional to 0 and populate verified_by/verified_at.
 *
 * Usage:
 *   node src/db/seed-formulary.js                  # strict — fails on any unsigned row
 *   node src/db/seed-formulary.js --allow-unverified   # provisional load (R1 fallback)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = path.resolve(__dirname, '../../../seeds');

const ALLOW_UNVERIFIED = process.argv.includes('--allow-unverified');

// ─── Normalization helpers ────────────────────────────────────────────────────

/** Trim; strip parenthetical qualifiers so interaction names match formulary names.
 *  "metformin (immediate-release)" → "metformin"; "co-amoxiclav (amoxicillin/…)" → "co-amoxiclav" */
function canonicalName(raw) {
  if (!raw) return null;
  return raw
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  return /^(yes|true|1)$/i.test(String(v ?? '').trim()) ? 1 : 0;
}

function brandArray(v) {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const VALID_MEAL = new Set(['NONE', 'AC', 'PC', 'WITH_MEAL', 'HS']);
function mealAnchor(v) {
  const code = String(v ?? 'NONE')
    .trim()
    .toUpperCase();
  return VALID_MEAL.has(code) ? code : 'NONE';
}

/** Map the sheet's free severity vocabulary → the DB enum. */
function mapSeverity(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('none')) return 'none';
  if (s.includes('contraindicated')) return 'contraindicated';
  if (s.includes('moderate-severe') || s.includes('severe')) return 'high';
  if (s.includes('mild-moderate')) return 'moderate';
  if (s.includes('moderate')) return 'moderate';
  if (s.includes('mild')) return 'low';
  return 'moderate';
}

/**
 * Derive interaction_type deterministically:
 *   - numeric gap > 0            → SPACING
 *   - gap == 0 (none checked)    → NONE (explicit "no documented gap")
 *   - no gap + mild severity     → MONITOR (clinical caution, not a spacing fix)
 *   - no gap + moderate/higher   → AVOID (duplicate therapy / renal risk)
 */
function deriveType(gap, severity) {
  if (gap !== null && gap > 0) return 'SPACING';
  if (gap === 0) return 'NONE';
  return severity === 'low' ? 'MONITOR' : 'AVOID';
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, name), 'utf8'));
}

async function seedFormulary(conn) {
  const rows = readJson('formulary_raw.json');
  const unsigned = rows.filter((r) => !r.verified_by);

  if (unsigned.length > 0 && !ALLOW_UNVERIFIED) {
    throw new Error(
      `Refusing to seed: ${unsigned.length}/${rows.length} formulary rows are unsigned ` +
        `(verified_by blank). Have the pharmacist sign the workbook, or run with ` +
        `--allow-unverified for a provisional (R1 fallback) load.`
    );
  }

  const nameToId = new Map();
  for (const r of rows) {
    const canonical = canonicalName(r.generic_name);
    const isProvisional = r.verified_by ? 0 : 1;
    // OTC/Rx classification (PH FDA); default RX when the sheet doesn't say.
    const rxClass = String(r.rx_class ?? '').toUpperCase() === 'OTC' ? 'OTC' : 'RX';
    const [res] = await conn.execute(
      `INSERT INTO drug_reference
         (generic_name, brand_names_json, min_interval_hours, max_daily_doses,
          is_prn_default, default_interval_hours, meal_anchor_code, meal_instruction,
          frequency_default, notes, is_restricted, rx_class, verified_by, verified_at, is_provisional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?)`,
      [
        canonical,
        JSON.stringify(brandArray(r.brand_names)),
        toNumber(r.min_interval_hours),
        toNumber(r.max_daily_doses),
        toBool(r.is_prn_default),
        toNumber(r.default_interval_hours),
        mealAnchor(r.meal_anchor_code),
        r.meal_instruction ?? null,
        r.standard_frequency ?? null,
        r.notes ?? null,
        rxClass,
        isProvisional,
      ]
    );
    // Fetch the generated id (UUID default) for interaction wiring.
    const [idRow] = await conn.execute(
      'SELECT id FROM drug_reference WHERE generic_name = ? ORDER BY created_at DESC LIMIT 1',
      [canonical]
    );
    void res;
    if (!nameToId.has(canonical)) nameToId.set(canonical, idRow[0].id);
  }
  return nameToId;
}

async function seedInteractions(conn, nameToId) {
  const rows = readJson('interactions_raw.json');
  const unmatched = [];
  let inserted = 0;

  for (const r of rows) {
    const a = canonicalName(r.drug_1);
    const b = canonicalName(r.drug_2);
    const idA = nameToId.get(a);
    const idB = nameToId.get(b);
    if (!idA || !idB) {
      unmatched.push(`${r.drug_1} ↔ ${r.drug_2}`);
      continue;
    }
    const gap = toNumber(r.min_gap_hours);
    const severity = mapSeverity(r.severity);
    const type = deriveType(gap, severity);
    const isProvisional = ALLOW_UNVERIFIED ? 1 : 0;

    // Store the pair with a stable ordering (idA < idB) to respect the UNIQUE key.
    const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
    await conn.execute(
      `INSERT INTO drug_interactions
         (drug_a_id, drug_b_id, min_gap_hours, interaction_type, severity, notes,
          verified_by, verified_at, is_provisional)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE min_gap_hours=VALUES(min_gap_hours),
         interaction_type=VALUES(interaction_type), severity=VALUES(severity),
         notes=VALUES(notes), is_provisional=VALUES(is_provisional)`,
      [lo, hi, gap, type, severity, r.note ?? null, isProvisional]
    );
    inserted++;
  }
  return { inserted, unmatched };
}

async function seedRestricted(conn) {
  const rows = readJson('restricted_placeholder.json');
  for (const r of rows) {
    await conn.execute(
      `INSERT INTO restricted_substances (generic_name, category, reason, is_provisional)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE category=VALUES(category), reason=VALUES(reason)`,
      [canonicalName(r.generic_name), r.category ?? null, r.reason ?? null]
    );
  }
  return rows.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Idempotent: clear curated tables before re-seeding.
    await conn.execute('DELETE FROM drug_interactions');
    await conn.execute('DELETE FROM drug_reference');
    await conn.execute('DELETE FROM restricted_substances');

    const nameToId = await seedFormulary(conn);
    const { inserted, unmatched } = await seedInteractions(conn, nameToId);
    const restrictedCount = await seedRestricted(conn);

    await conn.commit();

    console.log(
      `Seeded ${nameToId.size} drugs${ALLOW_UNVERIFIED ? ' (PROVISIONAL — unsigned)' : ''}.`
    );
    console.log(`Seeded ${inserted} interaction pairs.`);
    console.log(`Seeded ${restrictedCount} restricted substances (placeholder).`);
    if (unmatched.length > 0) {
      console.warn(`\n⚠  ${unmatched.length} interaction pair(s) had a drug not in the formulary:`);
      unmatched.forEach((u) => console.warn(`   - ${u}`));
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Formulary seed failed:', err.message);
  process.exit(1);
});
