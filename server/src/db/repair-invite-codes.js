/**
 * Repairs the exact XAMPP/MariaDB orphan-table failure where invite_codes is
 * present in information_schema but InnoDB returns error 1932. Healthy tables
 * are never modified. An orphaned table cannot contain a usable invite.
 */
import 'dotenv/config';
import { pool } from './connection.js';

async function constraintExists(name) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='caregiver_link_audit'
        AND CONSTRAINT_NAME=?`,
    [name]
  );
  return Number(row.total) > 0;
}

async function run() {
  let tableHealthy = false;
  try {
    await pool.query('SELECT id FROM invite_codes LIMIT 1');
    tableHealthy = true;
  } catch (error) {
    if (Number(error.errno) !== 1932) throw error;
  }

  if (tableHealthy) {
    if (await constraintExists('fk_cla_invite')) {
      console.log('invite_codes is healthy; no repair was needed.');
      return;
    }
    await pool.query(
      `UPDATE caregiver_link_audit a
          LEFT JOIN invite_codes i ON i.id=a.invite_id
          SET a.invite_id=NULL
        WHERE a.invite_id IS NOT NULL AND i.id IS NULL`
    );
    await pool.query(`
      ALTER TABLE caregiver_link_audit
        ADD CONSTRAINT fk_cla_invite FOREIGN KEY (invite_id) REFERENCES invite_codes(id) ON DELETE SET NULL
    `);
    console.log('Restored the caregiver audit foreign key.');
    return;
  }

  console.warn('Repairing orphaned invite_codes table (MariaDB error 1932).');
  if (await constraintExists('fk_cla_invite')) {
    await pool.query('ALTER TABLE caregiver_link_audit DROP FOREIGN KEY fk_cla_invite');
  }
  console.log('Detached the caregiver audit foreign key.');
  await pool.query('DROP TABLE IF EXISTS invite_codes');
  console.log('Removed the orphaned table definition.');
  await pool.query(`
    CREATE TABLE invite_codes (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      patient_id CHAR(36) NOT NULL,
      code VARCHAR(64) NULL,
      token_hash CHAR(64) NULL,
      expires_at DATETIME(3) NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      used_at DATETIME(3) NULL,
      used_by_caregiver_id CHAR(36) NULL,
      revoked_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_invite_code (code),
      UNIQUE KEY uq_invite_token_hash (token_hash),
      KEY idx_invite_patient_active (patient_id, used, revoked_at, expires_at),
      CONSTRAINT fk_invite_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      CONSTRAINT fk_invite_used_by_caregiver FOREIGN KEY (used_by_caregiver_id) REFERENCES caregivers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    ALTER TABLE caregiver_link_audit
      ADD CONSTRAINT fk_cla_invite FOREIGN KEY (invite_id) REFERENCES invite_codes(id) ON DELETE SET NULL
  `);
  console.log('invite_codes was rebuilt successfully. Existing unusable invites were removed.');
}

run()
  .catch((error) => {
    console.error('Invite-code repair failed:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sql: error.sql,
    });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
