import test from 'node:test';
import assert from 'node:assert/strict';
import { guidanceStage, medicineIssues } from './medicationGuidance.js';
test('progress separates dates, reminders, review and confirmed save', () => {
  assert.equal(guidanceStage('questions', 8), 2);
  assert.equal(guidanceStage('manual-times', 8), 3);
  assert.equal(guidanceStage('review', 8), 4);
  assert.equal(guidanceStage('success', 8), 5);
});
test('missing fields produce individual stable correction targets', () => {
  assert.deepEqual(
    medicineIssues({}, null).map((issue) => issue.step),
    [3, 6, 7, 8]
  );
});
test('correction checks never mutate directions or draft times', () => {
  const medicine = {
    strength_value: 500,
    strength_unit: 'mg',
    frequency_code: 'QID',
    dose_amount: 1,
    start_date: '2026-09-09',
  };
  const before = JSON.stringify(medicine);
  assert.equal(medicineIssues(medicine, '2026-09-15').length, 0);
  assert.equal(medicineIssues(medicine, '2026-09-08')[0].code, 'DATES_REQUIRED');
  assert.equal(JSON.stringify(medicine), before);
});
