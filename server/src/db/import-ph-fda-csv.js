import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './connection.js';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function key(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function clean(value) {
  return String(value || '').trim() || null;
}
function dateValue(value) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run import:ph-fda -- <official-fda-export.csv>');
const csvPath = path.resolve(input);
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''));
if (rows.length < 2) throw new Error('The CSV has no product rows.');
const headers = rows[0].map(key);
const aliases = {
  registration: ['registrationnumber', 'registrationno', 'cprnumber'],
  generic: ['genericname'],
  brand: ['brandname'],
  strength: ['dosagestrength', 'strength'],
  form: ['dosageform', 'form'],
  category: ['pharmacologiccategory', 'category'],
  application: ['applicationtype'],
  issuance: ['issuancedate'],
  expiry: ['expirydate', 'expirationdate'],
};
function indexFor(name) {
  return headers.findIndex((header) => aliases[name].includes(header));
}
const indexes = Object.fromEntries(Object.keys(aliases).map((name) => [name, indexFor(name)]));
if (indexes.registration < 0 || indexes.generic < 0 || indexes.application < 0) {
  throw new Error('Required columns: Registration Number, Generic Name, and Application Type.');
}

const report = { read: rows.length - 1, imported: 0, otc: 0, pending_pharmacist: 0, rejected: 0 };
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  for (const values of rows.slice(1)) {
    const registration = clean(values[indexes.registration]);
    const generic = clean(values[indexes.generic]);
    const application = clean(values[indexes.application]);
    if (!registration || !generic || !application) {
      report.rejected++;
      continue;
    }
    const regulatoryClass = /\botc\b/i.test(application) ? 'OTC' : 'PENDING_PHARMACIST';
    await conn.execute(
      `INSERT INTO ph_fda_drug_products
       (registration_number,generic_name,brand_name,dosage_strength,dosage_form,
        pharmacologic_category,application_type,issuance_date,expiry_date,regulatory_class)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE generic_name=VALUES(generic_name),brand_name=VALUES(brand_name),
        dosage_strength=VALUES(dosage_strength),dosage_form=VALUES(dosage_form),
        pharmacologic_category=VALUES(pharmacologic_category),application_type=VALUES(application_type),
        issuance_date=VALUES(issuance_date),expiry_date=VALUES(expiry_date),
        regulatory_class=VALUES(regulatory_class),imported_at=NOW(3)`,
      [
        registration,
        generic,
        clean(values[indexes.brand]),
        clean(values[indexes.strength]),
        clean(values[indexes.form]),
        clean(values[indexes.category]),
        application,
        dateValue(values[indexes.issuance]),
        dateValue(values[indexes.expiry]),
        regulatoryClass,
      ]
    );
    const expiry = dateValue(values[indexes.expiry]);
    if (regulatoryClass === 'OTC' && (!expiry || expiry >= new Date().toISOString().slice(0, 10))) {
      const [[existing]] = await conn.execute(
        'SELECT id FROM drug_reference WHERE LOWER(generic_name)=LOWER(?) ORDER BY is_provisional ASC LIMIT 1',
        [generic]
      );
      if (existing) {
        await conn.execute(
          `UPDATE drug_reference SET rx_class='OTC', is_provisional=0,
           category=COALESCE(category, 'PH FDA registered OTC') WHERE id=?`,
          [existing.id]
        );
      } else {
        await conn.execute(
          `INSERT INTO drug_reference
           (generic_name,brand_names_json,category,is_restricted,availability,rx_class,is_provisional)
           VALUES (?,?,'PH FDA registered OTC',0,1,'OTC',0)`,
          [
            generic,
            JSON.stringify(clean(values[indexes.brand]) ? [clean(values[indexes.brand])] : []),
          ]
        );
      }
    }
    report.imported++;
    if (regulatoryClass === 'OTC') report.otc++;
    else report.pending_pharmacist++;
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
