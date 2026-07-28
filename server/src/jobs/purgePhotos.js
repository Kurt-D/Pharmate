/**
 * Prescription photo purge job (Sprint 5, D-K).
 *
 * Deletes redacted prescription images 7 days after their validation decision;
 * the decision metadata (who/when/outcome) is retained. Run on a schedule
 * (node-cron dispatcher arrives in Sprint 6) or manually: `npm run purge:photos`.
 */
import 'dotenv/config';
import { pool } from '../db/connection.js';
import { purgeExpiredPhotos } from '../services/prescription.js';

async function run() {
  const count = await purgeExpiredPhotos();
  console.log(`Purged ${count} expired prescription photo(s).`);
}

run()
  .catch((err) => {
    console.error('Photo purge failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
