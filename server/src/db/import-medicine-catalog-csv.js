import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './connection.js';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run import:medicine-catalog -- <medicine-list.csv>');

function parseCsv(text) {
  const rows = [];
  let row = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((cells) => cells.some(Boolean))
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? '']))
    );
}

const rows = parseCsv(fs.readFileSync(path.resolve(input), 'utf8').replace(/^\uFEFF/, ''));
const report = { read: rows.length, inserted: 0, updated: 0, preserved_verified: 0, rejected: 0 };
const seen = new Set();
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  for (const row of rows) {
    const name = row.generic_name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name)) {
      report.rejected++;
      continue;
    }
    seen.add(name);
    const rxClass = row.rx_otc_status_ph_reference.toUpperCase() === 'OTC' ? 'OTC' : 'RX';
    const [[existing]] = await conn.execute(
      `SELECT id,is_provisional FROM drug_reference
       WHERE LOWER(TRIM(generic_name))=? ORDER BY is_provisional ASC,created_at ASC LIMIT 1`,
      [name]
    );
    const metadata = [
      row.therapeutic_category || null,
      row.drug_class || null,
      row.common_uses_conditions || null,
      row.short_description || null,
      row.common_strength || null,
      row.dosage_form || null,
      path.basename(input),
    ];
    if (existing) {
      await conn.execute(
        `UPDATE drug_reference SET therapeutic_category=?,drug_class=?,common_uses=?,short_description=?,
         common_strength=?,dosage_form=?,catalog_source=?,rx_class=COALESCE(rx_class,?),availability=1
         WHERE id=?`,
        [...metadata, rxClass, existing.id]
      );
      if (existing.is_provisional) report.updated++;
      else report.preserved_verified++;
    } else {
      await conn.execute(
        `INSERT INTO drug_reference
         (generic_name,brand_names_json,category,therapeutic_category,drug_class,common_uses,
          short_description,common_strength,dosage_form,catalog_source,is_restricted,availability,rx_class,is_provisional)
         VALUES (?,JSON_ARRAY(),?,?,?,?,?,?,?,?,0,1,?,1)`,
        [name, row.therapeutic_category || null, ...metadata, rxClass]
      );
      report.inserted++;
    }
  }
  await conn.commit();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  conn.release();
  await pool.end();
}
