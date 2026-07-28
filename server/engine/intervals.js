/**
 * Token → ideal slot semantics — pure. (ENG §4 interval table, §5 step 1.)
 *
 * Given a normalized frequency_code (from frequencyParser) and the patient's
 * anchors, describe the *ideal* placement before any constraint shifting:
 *
 *   { kind: 'interval', intervalMin, token }        — clock interval from wake
 *   { kind: 'anchored', slots:[min…], labels:[…] }  — fixed meal/sleep slots
 *   { kind: 'prn' }                                 — never placed (§7)
 *   { kind: 'consult' }                             — unrecognized (route to pharmacist)
 *
 * Panel directive D-A: a bare frequency word (TID) means strict clock intervals
 * from the wake anchor — NOT breakfast/lunch/dinner. Meal anchoring applies only
 * when the code carries MEALMAP/HS.
 */

import { parseClock } from './time.js';

const WORD_INTERVAL = { QD: 1440, BID: 720, TID: 480, QID: 360 };

/** AC = 30 min before the meal, PC = 30 min after (ENG §4). */
function applyMealModifier(minute, modifier) {
  if (modifier === 'AC') return minute - 30;
  if (modifier === 'PC') return minute + 30;
  return minute;
}

export function idealSlots(frequencyCode, anchors) {
  if (!frequencyCode || typeof frequencyCode !== 'string') return { kind: 'consult' };

  const [token, modifier] = frequencyCode.split(':'); // modifier: 'AC' | 'PC' | undefined

  if (token === 'PRN') return { kind: 'prn' };
  if (token === 'CONSULT') return { kind: 'consult' };

  if (token === 'HS') {
    return {
      kind: 'anchored',
      slots: [applyMealModifier(parseClock(anchors.sleep), modifier)],
      labels: ['bedtime'],
      modifier,
    };
  }

  const meal = token.match(/^MEALMAP\((\d),(\d),(\d)\)$/);
  if (meal) {
    const digits = [Number(meal[1]), Number(meal[2]), Number(meal[3])];
    const anchorMin = [
      parseClock(anchors.breakfast),
      parseClock(anchors.lunch),
      parseClock(anchors.dinner),
    ];
    const names = ['breakfast', 'lunch', 'dinner'];
    const slots = [];
    const labels = [];
    for (let i = 0; i < 3; i++) {
      if (digits[i]) {
        slots.push(applyMealModifier(anchorMin[i], modifier));
        labels.push(names[i]);
      }
    }
    if (slots.length === 0) return { kind: 'consult' };
    return { kind: 'anchored', slots, labels, modifier };
  }

  if (WORD_INTERVAL[token]) {
    return { kind: 'interval', intervalMin: WORD_INTERVAL[token], token };
  }

  const q = token.match(/^q(\d{1,2})h$/);
  if (q) {
    const n = Number(q[1]);
    if (n >= 1 && n <= 24) return { kind: 'interval', intervalMin: n * 60, token };
  }

  return { kind: 'consult' };
}
