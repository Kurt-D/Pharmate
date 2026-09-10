import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFailure } from './scheduleFailure.js';

test('network and server failures offer retry instead of blaming a medicine rule', () => {
  for (const error of [new TypeError('Failed to fetch'), { status: 503 }]) {
    assert.equal(scheduleFailure(error).retryable, true);
    assert.match(scheduleFailure(error).message, /try again/i);
  }
});
test('validation preserves backend directions and blocking reasons', () => {
  const result = scheduleFailure({
    status: 422,
    body: {
      error: 'Enter exact times.',
      warnings: [{ severity: 'blocking', message: 'Directions need review.' }],
    },
  });
  assert.equal(result.retryable, false);
  assert.equal(result.message, 'Enter exact times. Directions need review.');
});
