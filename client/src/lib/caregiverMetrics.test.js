import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, summarizeDoses } from './caregiverMetrics.js';
const now = new Date(2026, 0, 1, 12);
const row = (status, hour = 8, extra = {}) => ({
  status,
  scheduled_at: new Date(2026, 0, 1, hour).toISOString(),
  ...extra,
});
test('empty schedules have no adherence percentage', () =>
  assert.equal(summarizeDoses([], now).adherence, null));
test('future doses are neither missed nor adherence failures', () => {
  const result = summarizeDoses([row('TAKEN'), row('MISSED', 18)], now);
  assert.equal(result.adherence, 100);
  assert.equal(result.counts.Missed, 0);
  assert.equal(result.counts.Upcoming, 1);
});
test('PRN and cancelled doses are excluded; skipped doses remain explicit', () => {
  const result = summarizeDoses(
    [
      row('TAKEN', 8, { is_prn: true }),
      row('TAKEN', 8, { schedule_type: 'PRN' }),
      row('CANCELLED'),
      row('SKIPPED'),
      row('MISSED'),
    ],
    now
  );
  assert.equal(result.total, 2);
  assert.equal(result.counts.Skipped, 1);
  assert.equal(result.adherence, 0);
});
test('local date keys handle year and leap-month boundaries', () => {
  assert.equal(dayKey(new Date(2026, 0, 0)), '2025-12-31');
  assert.equal(dayKey(new Date(2024, 2, 0)), '2024-02-29');
});
