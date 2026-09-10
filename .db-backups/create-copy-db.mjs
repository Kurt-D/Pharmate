import dotenv from '../server/node_modules/dotenv/lib/main.js';
import mysql from '../server/node_modules/mysql2/promise.js';

dotenv.config({ path: new URL('../server/.env', import.meta.url).pathname.slice(1) });
const database = 'pharmate_railway_copy';
const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});
await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
await connection.end();
console.log(database);
