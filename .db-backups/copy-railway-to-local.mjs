import dotenv from '../server/node_modules/dotenv/lib/main.js';
import mysql from '../server/node_modules/mysql2/promise.js';

dotenv.config({ path: new URL('../server/.env', import.meta.url).pathname.slice(1) });

const remote = await mysql.createConnection({
  host: process.env.RAILWAY_DB_HOST,
  port: Number(process.env.RAILWAY_DB_PORT),
  user: process.env.RAILWAY_DB_USER,
  password: process.env.RAILWAY_DB_PASSWORD,
  database: process.env.RAILWAY_DB_NAME,
  connectTimeout: 20000,
});
const local = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.LOCAL_COPY_DB_NAME,
  multipleStatements: false,
});

let foreignKeysDisabled = false;
try {
  const [remoteTables] = await remote.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const [localTables] = await local.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const remoteNames = remoteTables.map((row) => row.TABLE_NAME || row.table_name);
  const localNames = localTables.map((row) => row.TABLE_NAME || row.table_name);
  const localSet = new Set(localNames);
  const missing = remoteNames.filter((name) => !localSet.has(name));
  if (missing.length) throw new Error(`Local migrations are missing tables: ${missing.join(', ')}`);

  const domainTables = localNames.filter((name) => name !== 'schema_migrations');
  for (const table of domainTables) {
    const [[{ row_count: rowCount }]] = await local.query(
      `SELECT COUNT(*) AS row_count FROM \`${table}\``
    );
    if (Number(rowCount) !== 0)
      throw new Error(`Refusing to overwrite non-empty local copy table: ${table}`);
  }

  await local.query('SET FOREIGN_KEY_CHECKS = 0');
  foreignKeysDisabled = true;

  let totalRows = 0;
  for (const table of remoteNames) {
    if (table === 'schema_migrations') continue;
    const [rows, fields] = await remote.query(`SELECT * FROM \`${table}\``);
    if (!rows.length) {
      console.log(`${table}: 0`);
      continue;
    }
    const columns = fields.map((field) => field.name);
    const columnSql = columns.map((column) => `\`${column}\``).join(', ');
    const chunkSize = 200;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const placeholders = chunk
        .map(() => `(${columns.map(() => '?').join(', ')})`)
        .join(', ');
      const values = chunk.flatMap((row) => columns.map((column) => row[column]));
      await local.query(
        `INSERT INTO \`${table}\` (${columnSql}) VALUES ${placeholders}`,
        values
      );
    }
    totalRows += rows.length;
    console.log(`${table}: ${rows.length}`);
  }
  await local.query('SET FOREIGN_KEY_CHECKS = 1');
  foreignKeysDisabled = false;
  console.log(`COPY_COMPLETE tables=${remoteNames.length} rows=${totalRows}`);
} finally {
  if (foreignKeysDisabled) await local.query('SET FOREIGN_KEY_CHECKS = 1');
  await Promise.allSettled([remote.end(), local.end()]);
}
