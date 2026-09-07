import { suggestedTimes, validateMedicationSchedule } from '../services/scheduleDefinition.js';

describe('structured medication schedule rules', () => {
  test.each([
    ['QD', '08:00', ['08:00']],
    ['BID', '08:00', ['08:00', '20:00']],
    ['TID', '06:00', ['06:00', '14:00', '22:00']],
    ['Q6H', '06:00', ['06:00', '12:00', '18:00', '00:00']],
  ])('%s produces deterministic slots', (frequency, start, expected) => {
    expect(suggestedTimes(frequency, start).map((slot) => slot.time)).toEqual(expected);
  });

  test('every-six-hours preserves midnight as the next calendar day', () => {
    expect(suggestedTimes('Q6H', '06:00').at(-1)).toEqual({ time: '00:00', dayOffset: 1 });
  });

  test.each([
    ['ONCE_DAILY', ['08:00', '20:00'], null],
    ['TWICE_DAILY', ['08:00', '14:00', '20:00'], null],
    ['THREE_TIMES_DAILY', ['06:00', '12:00', '18:00', '22:00'], null],
    ['EVERY_N_HOURS', ['00:00', '06:00', '12:00', '18:00', '21:00'], 6],
  ])('rejects contradictory %s schedules', (frequencyType, scheduleTimes, intervalHours) => {
    expect(validateMedicationSchedule({ frequencyType, scheduleTimes, intervalHours, startDate: '2026-09-07' })).toMatchObject({
      valid: false,
      code: 'FREQUENCY_TIME_COUNT_MISMATCH',
    });
  });
});
