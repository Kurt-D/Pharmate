import { afterAll } from '@jest/globals';
import { pool } from './src/db/connection.js';

// Every integration test imports the Express app, which imports the shared
// MySQL pool even when that test does not import `pool` itself. Close that pool
// for every Jest environment so the process can exit naturally.
afterAll(async () => {
  await pool.end();
});
