/**
 * Frequency parser — pure function, no I/O. (ENG §4, full token table.)
 *
 * Converts a raw frequency string into a normalized frequency_code token.
 *
 * Token format:
 *   "QD"              — once daily (at wake anchor)
 *   "BID"             — twice daily (q12h)
 *   "TID"             — three times daily (q8h)
 *   "QID"             — four times daily (q6h)
 *   "q<N>h"           — strict N-hour interval (N = 1..24)
 *   "MEALMAP(m,n,e)"  — meal-anchored; m=breakfast n=lunch e=dinner (1/0)
 *   "HS"              — one dose at the sleep anchor (bedtime)
 *   "PRN"             — as needed (unscheduled; constraint-checked at log time)
 *   "CONSULT"         — unrecognized; route to pharmacist (never guessed)
 *
 * A meal modifier may be appended to an anchored token as ":AC" (before meals)
 * or ":PC" (after meals), e.g. "MEALMAP(1,1,1):PC". Per ENG §4, a frequency word
 * combined with a meal modifier ("TID after meals") becomes a MEALMAP with that
 * modifier rather than a clock interval.
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
  q4h: 'q4h',
  'every 4 hours': 'q4h',
  q6h: 'q6h',
  'every 6 hours': 'q6h',
  q8h: 'q8h',
  'every 8 hours': 'q8h',
  q12h: 'q12h',
  'every 12 hours': 'q12h',
  prn: 'PRN',
  'as needed': 'PRN',
  'if needed': 'PRN',
};

// Frequency word → meal slots, used when a meal modifier is present (ENG §4).
const WORD_TO_MEALMAP = {
  QD: 'MEALMAP(1,0,0)',
  BID: 'MEALMAP(1,0,1)',
  TID: 'MEALMAP(1,1,1)',
};

function withModifier(token, modifier) {
  return modifier ? `${token}:${modifier}` : token;
}

/**
 * @param {string} raw  - raw frequency text from the prescription/encode form
 * @returns {string}    - normalized frequency_code
 */
export function parseFrequency(raw) {
  if (!raw || typeof raw !== 'string') return 'CONSULT';

  const normalized = raw.trim().toLowerCase();

  // Detect and strip a meal modifier (AC = before meals, PC = after meals).
  let modifier = null;
  if (/\bbefore meals?\b|\bac\b/.test(normalized)) modifier = 'AC';
  else if (/\bafter meals?\b|\bpc\b/.test(normalized)) modifier = 'PC';

  const base = normalized
    .replace(/\b(before|after)\s+meals?\b/g, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1-0-1 / 1-1-1 / 0-0-1 meal notation.
  const notation = base.match(/^([01])\s*-\s*([01])\s*-\s*([01])$/);
  if (notation) {
    return withModifier(`MEALMAP(${notation[1]},${notation[2]},${notation[3]})`, modifier);
  }

  // Exact dictionary match.
  if (STRICT_MAP[base]) {
    const token = STRICT_MAP[base];
    // Frequency word + meal modifier → MEALMAP (ENG §4). QID has no clean meal map.
    if (modifier && WORD_TO_MEALMAP[token]) {
      return withModifier(WORD_TO_MEALMAP[token], modifier);
    }
    return token;
  }

  // Generic strict interval: "q6h", "q10h", "every 6 hours", "every 6 hrs".
  const qMatch =
    base.match(/^q\s*(\d{1,2})\s*h$/) || base.match(/^every\s+(\d{1,2})\s+(?:hours?|hrs?|h)$/);
  if (qMatch) {
    const n = Number(qMatch[1]);
    if (n >= 1 && n <= 24) return `q${n}h`;
  }

  // Bedtime.
  if (/^(hs|at bedtime|bedtime|before bed|at night|nightly)$/.test(base)) {
    return withModifier('HS', modifier);
  }

  // Meal words: "with breakfast and dinner" → MEALMAP.
  if (/breakfast|lunch|dinner/.test(base)) {
    const m = /breakfast/.test(base) ? 1 : 0;
    const n = /lunch/.test(base) ? 1 : 0;
    const e = /dinner/.test(base) ? 1 : 0;
    if (m + n + e > 0) return withModifier(`MEALMAP(${m},${n},${e})`, modifier);
  }

  return 'CONSULT';
}
