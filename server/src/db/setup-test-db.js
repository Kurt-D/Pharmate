/**
 * Prepare the dedicated test database — `npm run db:test:setup`.
 *
 * Creates pharmate_test (if needed), runs all migrations, and seeds the
 * formulary — all against the TEST database, never the dev one. Keeps the
 * throwaway accounts the Jest suite creates out of the dev `pharmate` DB.
 *
 * Runs the existing migrate/seed scripts as child processes with DB_NAME
 * overridden, so those scripts stay untouched.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.TEST_DB_NAME || 'pharmate_test';

async function main() {
  // 1. Create the database (idempotent).
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'pharmate',
    password: process.env.DB_PASS || '',
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
  console.log(`Ensured database \`${DB}\` exists.`);

  // 2. Migrate + seed the test DB (existing scripts, DB_NAME overridden).
  const env = { ...process.env, DB_NAME: DB };
  const run = (script, args = []) =>
    execFileSync('node', [path.join(__dirname, script), ...args], { stdio: 'inherit', env });

  run('migrate.js');
  run('seed-formulary.js', ['--allow-unverified']);

  console.log(`\nTest database \`${DB}\` is ready. \`npm test\` uses it automatically.`);
}

main().catch((err) => {
  console.error('Test DB setup failed:', err.message);
  process.exit(1);
});
