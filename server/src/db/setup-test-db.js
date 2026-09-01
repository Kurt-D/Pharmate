/**
 * Prepare the dedicated disposable test database — `npm run db:test:setup`.
 *
 * Recreates the test database, runs all migrations, and seeds the formulary —
 * never touching the dev database. The database name must end in `_test`.
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
const DB = process.env.TEST_DB_NAME || 'pharmate_jest_test';

function assertSafeTestDatabaseName(name) {
  // This script is destructive by design. Refuse every name that does not
  // clearly identify a disposable test database.
  if (!/^[a-zA-Z0-9_]+$/.test(name) || !name.toLowerCase().endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database: ${name}`);
  }
}

async function main() {
  assertSafeTestDatabaseName(DB);

  // 1. Recreate the disposable database. A clean schema prevents stale
  // migration metadata and orphaned InnoDB dictionary entries from turning
  // one setup issue into hundreds of misleading test failures.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'pharmate',
    password: process.env.DB_PASS || '',
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await conn.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log(`Recreated disposable database \`${DB}\`.`);

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
