/**
 * Dose-timing classification — pure. (ENG §8, decision D-C.)
 *
 * When a patient logs a dose as taken, the delay from its scheduled time decides
 * the adherence classification:
 *
 *   ≤ 30 min late   → 'taken'       (on-time grace window; the 30-minute rule)
 *   ≤ 2 h late      → 'taken_late'  (late but still counts, converts a MISSED)
 *   > 2 h late      → 'missed'      (a late log may attach, but it stays MISSED)
 *
 * Early logs (negative delay) are 'taken'. The thresholds match the manuscript's
 * System Flow step 8 and the ratified late/missed policy (D-C): no compression,
 * no double-dosing, and MISSED past the 2-hour window is immutable.
 */

export const ON_TIME_GRACE_MIN = 30;
export const LATE_WINDOW_MIN = 120;

/**
 * @param {number} delayMin  minutes between scheduled_time and logged_at (logged − scheduled)
 * @returns {'taken'|'taken_late'|'missed'}
 */
export function classifyByDelay(delayMin) {
  if (delayMin <= ON_TIME_GRACE_MIN) return 'taken';
  if (delayMin <= LATE_WINDOW_MIN) return 'taken_late';
  return 'missed';
}

/** Convenience wrapper taking Date objects (or ms epoch). */
export function classifyDose(scheduledTime, loggedTime) {
  const delayMin = (new Date(loggedTime).getTime() - new Date(scheduledTime).getTime()) / 60000;
  return classifyByDelay(delayMin);
}
