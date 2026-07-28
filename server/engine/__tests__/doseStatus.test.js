/** Dose classification tests — the 30-min / 2-hour rule (ENG §8, D-C). */
import { classifyByDelay, classifyDose } from '../doseStatus.js';

describe('classifyByDelay — 30-min / 2-hour rule', () => {
  test('early or on-time → taken', () => {
    expect(classifyByDelay(-10)).toBe('taken');
    expect(classifyByDelay(0)).toBe('taken');
    expect(classifyByDelay(30)).toBe('taken'); // boundary: exactly 30 is still on time
  });

  test('past the 30-min grace, within 2 h → taken_late', () => {
    expect(classifyByDelay(31)).toBe('taken_late'); // a dose logged at 31 min is never "taken"
    expect(classifyByDelay(120)).toBe('taken_late'); // boundary: exactly 2 h still converts
  });

  test('beyond 2 h → missed (immutable)', () => {
    expect(classifyByDelay(121)).toBe('missed');
    expect(classifyByDelay(600)).toBe('missed');
  });
});

describe('classifyDose — from timestamps', () => {
  test('classifies from scheduled + logged Date pair', () => {
    const scheduled = new Date('2026-07-28T08:00:00Z');
    expect(classifyDose(scheduled, new Date('2026-07-28T08:20:00Z'))).toBe('taken');
    expect(classifyDose(scheduled, new Date('2026-07-28T09:00:00Z'))).toBe('taken_late');
    expect(classifyDose(scheduled, new Date('2026-07-28T11:00:00Z'))).toBe('missed');
  });
});
