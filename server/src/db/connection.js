import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';

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
});

export function createUploadsDir() {
  const dir = path.resolve(process.env.UPLOADS_DIR || './uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
