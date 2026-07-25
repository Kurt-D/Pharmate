/**
 * Frequency parser — pure function, no I/O.
 *
 * Converts a raw frequency string (e.g. "three times daily", "q8h", "BID",
 * "with breakfast and dinner") into a normalized frequency_code token.
 *
 * Token format (Sprint 3 full implementation):
 *   "QD"           — once daily
 *   "BID"          — twice daily (every 12 h)
 *   "TID"          — three times daily (every 8 h)
 *   "QID"          — four times daily (every 6 h)
 *   "q4h"          — every 4 hours
 *   "q6h"          — every 6 hours
 *   "q8h"          — every 8 hours
 *   "q12h"         — every 12 hours
 *   "MEALMAP(m,n,e)"  — m=morning(1/0), n=noon(1/0), e=evening(1/0); meal-anchored
 *   "PRN"          — as needed
 *   "CONSULT"      — unrecognized; route to pharmacist
 *
 * Sprint 1 stub: the full token table from ENG §4 is implemented in Sprint 3.
 */

const STRICT_MAP = {
  qd: 'QD',
  'once daily': 'QD',
  'once a day': 'QD',
  od: 'QD',
  bid: 'BID',
  'twice daily': 'BID',
  'twice a day': 'BID',
  'two times daily': 'BID',
  tid: 'TID',
  'three times daily': 'TID',
  'three times a day': 'TID',
  'thrice daily': 'TID',
  qid: 'QID',
  'four times daily': 'QID',
  'four times a day': 'QID',
  'q4h': 'q4h',
  'every 4 hours': 'q4h',
  'q6h': 'q6h',
  'every 6 hours': 'q6h',
  'q8h': 'q8h',
  'every 8 hours': 'q8h',
  'q12h': 'q12h',
  'every 12 hours': 'q12h',
  prn: 'PRN',
  'as needed': 'PRN',
  'if needed': 'PRN',
};

/**
 * @param {string} raw  - raw frequency text from the prescription
 * @returns {string}    - normalized frequency_code
 */
export function parseFrequency(raw) {
  if (!raw || typeof raw !== 'string') return 'CONSULT';

  const normalized = raw.trim().toLowerCase();

  if (STRICT_MAP[normalized]) return STRICT_MAP[normalized];

  // Meal-anchored patterns — Sprint 3 will expand this significantly
  const mealMatch = normalized.match(/with\s+(breakfast|lunch|dinner)/gi);
  if (mealMatch) {
    const m = /breakfast/i.test(normalized) ? 1 : 0;
    const n = /lunch/i.test(normalized) ? 1 : 0;
    const e = /dinner/i.test(normalized) ? 1 : 0;
    if (m + n + e > 0) return `MEALMAP(${m},${n},${e})`;
  }

  return 'CONSULT';
}
