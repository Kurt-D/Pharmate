/**
 * Development seed — `npm run seed:dev`
 *
 * Creates one user of each role, anchors for the test patient,
 * and two stub drugs so Sprint 2-3 tests have something to work with.
 * Safe to run multiple times (INSERT IGNORE / duplicate check).
 */
import 'dotenv/config';
import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { encrypt } from '../utils/crypto.js';

const DEV_PASSWORD = 'Pharmate@dev1';

async function seed() {
  const conn = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'pharmate',
    user: process.env.DB_USER || 'pharmate',
    password: process.env.DB_PASS || '',
    timezone: '+08:00',
  });

  const hash = await bcrypt.hash(DEV_PASSWORD, 12);

  // ── Users ────────────────────────────────────────────────────────────────
  let patientUserId = uuidv4();
  let pharmacistUserId = uuidv4();
  let caregiverUserId = uuidv4();
  let adminUserId = uuidv4();
  const branchId = uuidv4();
  const drugAId = uuidv4();
  const drugBId = uuidv4();

  const users = [
    [patientUserId, 'patient@dev.pharmate', hash, 'patient'],
    [pharmacistUserId, 'pharmacist@dev.pharmate', hash, 'pharmacist'],
    [caregiverUserId, 'caregiver@dev.pharmate', hash, 'caregiver'],
    [adminUserId, 'admin@dev.pharmate', hash, 'admin'],
  ];

  for (const [id, email, pw, role] of users) {
    const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);

    if (existing.length === 0) {
      await conn.execute('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [
        id,
        email,
        pw,
        role,
      ]);
    } else {
      // Reuse the existing user's ID
      if (email === 'patient@dev.pharmate') {
        patientUserId = existing[0].id;
      } else if (email === 'pharmacist@dev.pharmate') {
        pharmacistUserId = existing[0].id;
      } else if (email === 'caregiver@dev.pharmate') {
        caregiverUserId = existing[0].id;
      } else if (email === 'admin@dev.pharmate') {
        adminUserId = existing[0].id;
      }
    }
  }

  // A repeated run generates fresh candidate UUIDs above, but existing users keep
  // their original IDs. Resolve those persisted IDs before inserting child rows;
  // otherwise the second run attempts to reference users that do not exist.
  const [persistedUsers] = await conn.execute(
    `SELECT id, email FROM users
     WHERE email IN (?, ?, ?, ?)`,
    users.map(([, email]) => email)
  );
  const idsByEmail = new Map(persistedUsers.map((user) => [user.email, user.id]));
  patientUserId = idsByEmail.get('patient@dev.pharmate');
  pharmacistUserId = idsByEmail.get('pharmacist@dev.pharmate');
  caregiverUserId = idsByEmail.get('caregiver@dev.pharmate');
  adminUserId = idsByEmail.get('admin@dev.pharmate');

  // ── Branch ───────────────────────────────────────────────────────────────
  const [existingBranch] = await conn.execute('SELECT id FROM pharmacy_branches LIMIT 1');
  const activeBranchId = existingBranch.length > 0 ? existingBranch[0].id : branchId;
  if (existingBranch.length === 0) {
    await conn.execute(
      `INSERT INTO pharmacy_branches (id, name, address, delivery_coverage)
       VALUES (?, 'PharMate Dev Branch', '123 Dev St, Manila', 'Metro Manila')`,
      [branchId]
    );
  }

  // ── Role-specific rows ───────────────────────────────────────────────────
  const [existingPat] = await conn.execute(
    'SELECT id, full_name_enc, medical_condition_enc FROM patients WHERE id = ?',
    [patientUserId]
  );
  const encryptedDevName = encrypt('Juan dela Cruz');
  const encryptedDevCondition = encrypt('Hypertension');
  if (existingPat.length === 0) {
    // Chronic condition on file + priority_flag=1 stands in for an approved
    // prescription (PART 4, flag 7) so the Priority/Standard badge is testable.
    // In production the flag is DERIVED from pharmacist validation, never seeded.
    await conn.execute(
      `INSERT INTO patients (id, patient_code, full_name_enc, medical_condition_enc, priority_flag)
       VALUES (?, 'PM-DEV001', ?, ?, 1)`,
      [patientUserId, encryptedDevName, encryptedDevCondition]
    );
    await conn.execute('INSERT INTO patient_anchors (patient_id) VALUES (?)', [patientUserId]);
    await conn.execute('INSERT INTO patient_preferences (patient_id) VALUES (?)', [patientUserId]);
  } else if (
    String(existingPat[0].full_name_enc || '').startsWith('DEV_PLAINTEXT_') ||
    String(existingPat[0].medical_condition_enc || '').startsWith('DEV_PLAINTEXT_')
  ) {
    await conn.execute(
      `UPDATE patients
       SET full_name_enc = ?, medical_condition_enc = ?
       WHERE id = ?`,
      [encryptedDevName, encryptedDevCondition, patientUserId]
    );
  }

  const [existingPharm] = await conn.execute('SELECT id FROM pharmacists WHERE id = ?', [
    pharmacistUserId,
  ]);
  if (existingPharm.length === 0) {
    await conn.execute(
      'INSERT INTO pharmacists (id, full_name, license_number, branch_id) VALUES (?, ?, ?, ?)',
      [pharmacistUserId, 'Dev Pharmacist', 'PH-DEV-001', activeBranchId]
    );
  }

  const [existingCg] = await conn.execute('SELECT id FROM caregivers WHERE id = ?', [
    caregiverUserId,
  ]);
  if (existingCg.length === 0) {
    await conn.execute('INSERT INTO caregivers (id, full_name) VALUES (?, ?)', [
      caregiverUserId,
      'Dev Caregiver',
    ]);
  }

  const [existingAdmin] = await conn.execute('SELECT id FROM admins WHERE id = ?', [adminUserId]);
  if (existingAdmin.length === 0) {
    await conn.execute('INSERT INTO admins (id) VALUES (?)', [adminUserId]);
  }

  // ── Drug reference stubs (pharmacist will replace with real curation) ────
  const [existingDrug] = await conn.execute('SELECT id FROM drug_reference LIMIT 1');
  if (existingDrug.length === 0) {
    await conn.execute(
      `INSERT INTO drug_reference
         (id, generic_name, brand_names_json, min_interval_hours, max_daily_doses,
          frequency_default, verified_by, verified_at)
       VALUES
         (?, 'Amoxicillin', '["Amoxil","Trimox"]', 8, 3, 'TID', ?, NOW()),
         (?, 'Paracetamol', '["Biogesic","Tempra"]', 4, 6, 'q4h', ?, NOW())`,
      [drugAId, pharmacistUserId, drugBId, pharmacistUserId]
    );
    // One interaction pair: Amoxicillin + Paracetamol (low severity, 1h gap)
    await conn.execute(
      `INSERT INTO drug_interactions
         (drug_a_id, drug_b_id, min_gap_hours, severity, verified_by, verified_at)
       VALUES (?, ?, 1, 'low', ?, NOW())`,
      [drugAId, drugBId, pharmacistUserId]
    );
  }
  await conn.execute(
    `INSERT INTO medication_rule_variants
       (id,drug_id,strength,dosage_form,schedule_rule_status,rule_version)
     SELECT UUID(),drug.id,NULLIF(drug.common_strength,''),NULLIF(drug.dosage_form,''),
            drug.clinical_rule_status,drug.rule_version
     FROM drug_reference drug
     WHERE NOT EXISTS (SELECT 1 FROM medication_rule_variants rule_record WHERE rule_record.drug_id=drug.id)`
  );

  await conn.end();
  console.log('Dev seed complete.');
  console.log('Logins (all roles):  password =', DEV_PASSWORD);
  console.log('  patient@dev.pharmate');
  console.log('  pharmacist@dev.pharmate');
  console.log('  caregiver@dev.pharmate');
  console.log('  admin@dev.pharmate');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
