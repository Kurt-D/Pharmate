/**
 * Migration runner — reads numbered .sql files from /server/migrations/
 * and executes each one that hasn't been applied yet.
 * Tracks applied migrations in a `schema_migrations` table.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function getConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'pharmate',
    user: process.env.DB_USER || 'pharmate',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
    timezone: '+08:00',
  });
}

async function ensureMigrationsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename  VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function appliedMigrations(conn) {
  const [rows] = await conn.execute('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  const conn = await getConnection();
  try {
    await ensureMigrationsTable(conn);
    const applied = await appliedMigrations(conn);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await conn.query(sql);
      await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      count++;
    }

    if (count === 0) {
      console.log('All migrations already applied.');
    } else {
      console.log(`Applied ${count} migration(s).`);
    }
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
