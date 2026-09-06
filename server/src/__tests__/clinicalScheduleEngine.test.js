import { generateClinicalSchedule } from '../services/scheduleEngine.js';

const rule = (overrides = {}) => ({
  drug_id: '00000000-0000-4000-8000-000000000001',
  generic_name: 'Example medicine',
  default_strength: '50 mg',
  dosage_form: 'tablet',
  standard_frequency: 'BID',
  food_rule: 'WITH_MEAL',
  min_interval_hours: 0,
  max_daily_doses: 2,
  clinical_rule_status: 'VERIFIED',
  food_instruction: 'Take with meals',
  ...overrides,
});

describe('automated clinical schedule engine', () => {
  test('is deterministic and maps BID to breakfast and dinner', () => {
    const first = generateClinicalSchedule([rule()]);
    const second = generateClinicalSchedule([rule()]);
    expect(first).toEqual(second);
    expect(first.can_save).toBe(true);
    expect(first.schedule.map((slot) => slot.time)).toEqual(['08:00', '19:00']);
  });

  test('groups different medicines assigned to the same time', () => {
    const result = generateClinicalSchedule([
      rule({ standard_frequency: 'QD' }),
      rule({
        drug_id: '00000000-0000-4000-8000-000000000002',
        generic_name: 'Second medicine',
        standard_frequency: 'QD',
      }),
    ]);
    expect(result.schedule).toHaveLength(1);
    expect(result.schedule[0].medicines).toHaveLength(2);
  });

  test('deduplicates the same active ingredient with a warning', () => {
    const result = generateClinicalSchedule([rule(), rule()]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_ACTIVE_INGREDIENT' })])
    );
    expect(result.schedule.flatMap((slot) => slot.medicines)).toHaveLength(2);
  });

  test('blocks an unverified rule rather than guessing', () => {
    const result = generateClinicalSchedule([rule({ clinical_rule_status: 'UNVERIFIED' })]);
    expect(result.can_save).toBe(false);
    expect(result.warnings[0].code).toBe('VERIFIED_RULE_UNAVAILABLE');
  });

  test('honors the verified daily dose cap for q4h rules', () => {
    const result = generateClinicalSchedule([
      rule({ standard_frequency: 'q4h', max_daily_doses: 4, min_interval_hours: 4 }),
    ]);
    expect(result.schedule.flatMap((slot) => slot.medicines)).toHaveLength(4);
  });

  test('does not try to solve avoid or monitoring interactions with time spacing', () => {
    const second = rule({
      drug_id: '00000000-0000-4000-8000-000000000002',
      generic_name: 'Second medicine',
    });
    for (const interaction_type of ['AVOID', 'MONITOR']) {
      const result = generateClinicalSchedule([rule(), second], [
        {
          drug_a_id: rule().drug_id,
          drug_b_id: second.drug_id,
          interaction_type,
          severity: 'moderate',
          min_gap_hours: null,
        },
      ]);
      expect(result.can_save).toBe(false);
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'NO_CONFLICT_FREE_SOLUTION' })])
      );
    }
  });

  test('uses evenly spaced times when BID requires a 12-hour minimum gap', () => {
    const result = generateClinicalSchedule([
      rule({
        food_rule: 'NONE',
        min_interval_hours: 12,
      }),
    ]);

    expect(result.can_save).toBe(true);
    expect(result.schedule.map((slot) => slot.time)).toEqual(['08:00', '20:00']);
  });

  test('uses the patient first-dose preference without changing the verified pattern', () => {
    const result = generateClinicalSchedule([rule({ first_dose_time: '09:00' })]);

    expect(result.can_save).toBe(true);
    expect(result.schedule.map((slot) => slot.time)).toEqual(['09:00', '20:00']);
  });

  test('keeps exact hourly gaps when a first-dose preference is supplied', () => {
    const result = generateClinicalSchedule([
      rule({
        standard_frequency: 'Q8H',
        max_daily_doses: 3,
        min_interval_hours: 8,
        first_dose_time: '07:00',
        food_rule: 'NONE',
      }),
    ]);

    expect(result.can_save).toBe(true);
    expect(result.schedule.map((slot) => slot.time)).toEqual(['07:00', '15:00', '23:00']);
  });

  test('uses patient-friendly wording when no reminder times can satisfy the rules', () => {
    const result = generateClinicalSchedule([rule({ min_interval_hours: 13 })]);

    expect(result.can_save).toBe(false);
    expect(result.warnings[0]).toEqual(
      expect.objectContaining({
        code: 'NO_CONFLICT_FREE_SOLUTION',
        message: expect.stringContaining('Check how often your label or prescription'),
      })
    );
    expect(result.warnings[0].message).not.toMatch(/layout|interval rule/i);
  });

  test('keeps PRN medicine out of recurring slots and creates a directions-only tracker', () => {
    const result = generateClinicalSchedule([
      rule({
        standard_frequency: 'PRN',
        rule_kind: 'PRN',
        dosage_instruction: 'Take 1 tablet',
        label_direction: 'Take 1 tablet as needed; do not exceed 4 tablets in 24 hours',
        min_interval_hours: 6,
        max_daily_doses: 4,
      }),
    ]);

    expect(result.can_save).toBe(true);
    expect(result.schedule).toEqual([]);
    expect(result.prn_trackers).toEqual([
      expect.objectContaining({ recurring_reminders: false, min_interval_hours: 6 }),
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PRN_TRACKER_ONLY' })])
    );
  });

  test('does not create a PRN tracker without a reviewed interval and 24-hour limit', () => {
    const result = generateClinicalSchedule([
      rule({
        standard_frequency: 'PRN',
        rule_kind: 'PRN',
        dosage_instruction: 'Take 1 tablet as needed',
        label_direction: 'Take as needed',
        min_interval_hours: 0,
        max_daily_doses: 0,
      }),
    ]);
    expect(result.can_save).toBe(false);
    expect(result.warnings[0]).toEqual(
      expect.objectContaining({ code: 'PRN_DIRECTIONS_REQUIRED', severity: 'blocking' })
    );
  });
});
