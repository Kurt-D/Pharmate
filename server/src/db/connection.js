import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';

const STRUCTURED_JSON_COLUMNS = new Set(['before_info', 'after_info']);

function parseStructuredJson(field, next) {
  if (!STRUCTURED_JSON_COLUMNS.has(field.name)) return next();
  const value = field.string();
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'pharmate',
  user: process.env.DB_USER || 'pharmate',
  password: process.env.DB_PASS || '',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+08:00',
  dateStrings: false,
  // MariaDB exposes JSON aliases as text. Normalizing audit snapshots here
  // keeps their API shape identical across MySQL and MariaDB installations.
  typeCast: parseStructuredJson,
});

export function createUploadsDir() {
  const dir = path.resolve(process.env.UPLOADS_DIR || './uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
