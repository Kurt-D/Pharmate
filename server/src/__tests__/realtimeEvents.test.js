import { publishRole, publishUser, subscribeRealtime } from '../services/realtimeEvents.js';
import { pool } from '../db/connection.js';

function responseRecorder() {
  const chunks = [];
  return {
    chunks,
    write(value) {
      chunks.push(value);
    },
  };
}

afterAll(async () => pool.end());

test('a subscriber receives its private user events and role broadcasts', () => {
  const response = responseRecorder();
  const unsubscribe = subscribeRealtime({ sub: 'realtime-patient-1', role: 'patient' }, response);

  publishUser('realtime-patient-1', 'streak-updated', { current_days: 3 });
  publishRole('patient', 'notification-updated', { unread_count: 2 });
  publishUser('another-patient', 'private-event', { hidden: true });

  const output = response.chunks.join('');
  expect(output).toContain('event: connected');
  expect(output).toContain('event: streak-updated');
  expect(output).toContain('"current_days":3');
  expect(output).toContain('event: notification-updated');
  expect(output).not.toContain('private-event');
  unsubscribe();
});

test('unsubscribe stops future delivery', () => {
  const response = responseRecorder();
  const unsubscribe = subscribeRealtime(
    { sub: 'realtime-pharmacist-1', role: 'pharmacist' },
    response
  );
  unsubscribe();
  const before = response.chunks.length;
  publishRole('pharmacist', 'dispense-log', { status: 'taken' });
  expect(response.chunks).toHaveLength(before);
});
