/**
 * Missed-dose sweep job (Sprint 6, D-C — the 30-minute rule).
 *
 * Marks scheduled doses more than 30 minutes overdue as MISSED. Intended to run
 * frequently (the node-cron dispatcher arrives with the reminder pipeline); can
 * also be run manually: `npm run sweep:missed`.
 *
 * A dose swept to MISSED can still be converted to TAKEN_LATE by a log inside the
 * 2-hour window (that path runs through the dose-log endpoint); past that it is
 * immutable in the adherence record.
 */
import 'dotenv/config';
import { pool } from '../db/connection.js';
import { sweepMissed } from '../services/doses.js';

sweepMissed()
  .then((n) => console.log(`Marked ${n} dose(s) as missed.`))
  .catch((err) => {
    console.error('Missed sweep failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
