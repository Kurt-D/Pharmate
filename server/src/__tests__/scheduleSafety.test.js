import { describe, expect, test } from '@jest/globals';
import { classifyScheduleSafety } from '../services/schedule.js';

const med = (id, drugId, drugName) => ({
  id,
  drugId,
  drugName,
  frequencyCode: 'QD',
  isVerified: true,
});

describe('deterministic medication schedule safety classification', () => {
  test('returns SAFE_SCHEDULE when no verified conflict or spacing rule exists', () => {
    const result = classifyScheduleSafety(
      { medications: [med('m1', 'd1', 'Medicine A')], interactions: [] },
      { slots: [], unresolved: [] }
    );
    expect(result.classification).toBe('SAFE_SCHEDULE');
    expect(result.can_save).toBe(true);
  });

  test('does not add duplicate medicine rows to the schedule safety message', () => {
    const result = classifyScheduleSafety(
      { medications: [med('m1', 'd1', 'Medicine A'), med('m2', 'd1', 'Medicine A')], interactions: [] },
      { slots: [], unresolved: [] }
    );
    expect(result.classification).toBe('SAFE_SCHEDULE');
    expect(result.findings.some((item) => item.code === 'DUPLICATE_MEDICINE')).toBe(false);
  });

  test('explains a verified spacing recommendation', () => {
    const result = classifyScheduleSafety(
      {
        medications: [med('m1', 'd1', 'Medicine A'), med('m2', 'd2', 'Medicine B')],
        interactions: [{ drugAId: 'd1', drugBId: 'd2', type: 'SPACING', minGapHours: 2, severity: 'moderate', isVerified: true }],
      },
      { slots: [], unresolved: [] }
    );
    expect(result.classification).toBe('TIMING_ADJUSTED');
    expect(result.findings[0].message).toMatch(/2 hours apart/i);
  });

  test('blocks a verified avoid rule as a potential conflict', () => {
    const result = classifyScheduleSafety(
      {
        medications: [med('m1', 'd1', 'Medicine A'), med('m2', 'd2', 'Medicine B')],
        interactions: [{ drugAId: 'd1', drugBId: 'd2', type: 'AVOID', minGapHours: null, severity: 'contraindicated', isVerified: true }],
      },
      { slots: [], unresolved: [] }
    );
    expect(result.classification).toBe('VERIFIED_RECOMMENDATION_UNAVAILABLE');
    expect(result.can_save).toBe(false);
  });
});
