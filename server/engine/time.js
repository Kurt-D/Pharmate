/**
 * Time helpers for the schedule engine — pure, no clock reads. (ENG §2)
 *
 * The engine works entirely in "minute of day" integers measured from 00:00 of
 * the generation date, local (Asia/Manila) time. A value ≥ 1440 means the dose
 * falls on the following day (e.g. q8h from 08:00 → …, 00:00 = minute 1440).
 * The caller converts these back to absolute UTC datetimes when persisting.
 */

/** Parse 'HH:MM' or 'HH:MM:SS' → minutes since midnight. */
export function parseClock(s) {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + m;
}

/** Format a minute-of-day value → 'HH:MM', wrapping across midnight. */
export function formatClock(minuteOfDay) {
  const wrapped = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Which day a minute-of-day value lands on (0 = generation date, 1 = next day). */
export function dayOffset(minuteOfDay) {
  return Math.floor(minuteOfDay / 1440);
}
