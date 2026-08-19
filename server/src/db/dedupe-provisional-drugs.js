import 'dotenv/config';
import { pool } from './connection.js';

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  const [duplicates] = await conn.execute(
    `SELECT p.id,p.generic_name,
            (SELECT COUNT(*) FROM medications m WHERE m.drug_id=p.id) AS medication_refs
     FROM drug_reference p
     WHERE p.is_provisional=1
       AND EXISTS (
         SELECT 1 FROM drug_reference v
         WHERE v.is_provisional=0
           AND LOWER(TRIM(v.generic_name))=LOWER(TRIM(p.generic_name))
       )
     FOR UPDATE`
  );
  const removable = duplicates.filter((row) => Number(row.medication_refs) === 0);
  for (const row of removable) {
    await conn.execute('DELETE FROM drug_reference WHERE id=? AND is_provisional=1', [row.id]);
  }
  await conn.commit();
  console.log(JSON.stringify({
    provisional_duplicates_found: duplicates.length,
    removed_unreferenced: removable.length,
    preserved_referenced: duplicates.length - removable.length,
  }, null, 2));
} catch (error) {
  await conn.rollback(); throw error;
} finally {
  conn.release(); await pool.end();
}
