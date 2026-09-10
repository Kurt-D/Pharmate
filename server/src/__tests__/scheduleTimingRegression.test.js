import { deriveScheduleDefinition } from '../services/scheduleDefinition.js';
import {
  computeDoseStatus,
  dateRangeBounds,
  isCalendarDate,
} from '../services/medicationSchedule.js';
import { generateClinicalSchedule } from '../services/scheduleEngine.js';

const rule = {
  drug_id: 'test-drug',
  generic_name: 'Test medicine',
  standard_frequency: 'BID',
  clinical_rule_status: 'PATIENT_LABEL',
  max_daily_doses: 2,
  min_interval_hours: 0,
  food_rule: 'NONE',
  require_entered_timing: true,
};

test('daily frequency plus first time does not invent a second time', () => {
  expect(generateClinicalSchedule([{ ...rule, first_dose_time: '08:00' }]).can_save).toBe(false);
});
test('exact patient times are not shifted by meal anchors', () => {
  const result = generateClinicalSchedule([
    { ...rule, schedule_times: ['08:00', '20:00'], food_rule: 'AFTER_MEAL' },
  ]);
  expect(result.can_save).toBe(true);
  expect(result.schedule.map((group) => group.time)).toEqual(['08:00', '20:00']);
});
test('explicit interval preserves its entered start', () => {
  const result = generateClinicalSchedule([
    { ...rule, standard_frequency: 'Q8H', max_daily_doses: 3, first_dose_time: '06:30' },
  ]);
  expect(result.schedule.map((group) => group.time)).toEqual(['06:30', '14:30', '22:30']);
});
test('invalid weekly days require review and PRN has no recurring times', () => {
  expect(
    deriveScheduleDefinition({ schedule_type: 'WEEKLY', schedule_times: ['08:00'] }, 'QD').status
  ).toBe('NEEDS_REVIEW');
  expect(
    deriveScheduleDefinition({ is_prn: true, schedule_times: ['08:00'] }, 'PRN').times
  ).toEqual([]);
});
test('calendar validates real dates and respects Manila midnight', () => {
  expect(isCalendarDate('2026-02-30')).toBe(false);
  expect(isCalendarDate('2028-02-29')).toBe(true);
  const bounds = dateRangeBounds('2026-09-07', '2026-09-07');
  expect(bounds.start.toISOString()).toBe('2026-09-06T16:00:00.000Z');
  expect(bounds.end.toISOString()).toBe('2026-09-07T16:00:00.000Z');
});
test('dose status boundaries use one configured window and intake wins', () => {
  const dose = { scheduled_at: '2026-09-07T00:00:00Z', stored_status: 'scheduled' };
  expect(computeDoseStatus(dose, new Date('2026-09-06T23:59:59Z'))).toBe('UPCOMING');
  expect(computeDoseStatus(dose, new Date('2026-09-07T00:00:00Z'))).toBe('DUE');
  expect(computeDoseStatus(dose, new Date('2026-09-07T00:30:00Z'))).toBe('DUE');
  expect(computeDoseStatus(dose, new Date('2026-09-07T00:30:01Z'))).toBe('MISSED');
  expect(computeDoseStatus({ ...dose, taken_at: '2026-09-07T03:00:00Z' })).toBe('TAKEN');
});
