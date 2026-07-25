-- PharMate Initial Schema
-- Manuscript Tables 15-29 plus schedule-engine deltas (ENG §3)
-- Timezone: Asia/Manila (UTC+8). All DATETIME columns store UTC; application converts.
-- PII fields (full_name_enc, contact_num_enc, address_enc, medical_condition_enc)
--   store AES-256-GCM ciphertext as "base64iv:base64tag:base64ciphertext" (app layer).

SET time_zone = '+08:00';
SET NAMES utf8mb4;

-- ─── CORE USERS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  email        VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role         ENUM('patient','pharmacist','caregiver','admin') NOT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 15 — Patients
CREATE TABLE IF NOT EXISTS patients (
  id                    CHAR(36)     NOT NULL,  -- FK → users.id
  patient_code          VARCHAR(9)   NOT NULL,  -- PM-XXXXXX (PM- + 6 uppercase alphanum)
  full_name_enc         TEXT,                   -- AES-256-GCM encrypted
  contact_num_enc       TEXT,                   -- AES-256-GCM encrypted
  address_enc           TEXT,                   -- AES-256-GCM encrypted
  medical_condition_enc TEXT,                   -- AES-256-GCM encrypted
  fcm_token             TEXT,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_code (patient_code),
  CONSTRAINT fk_patients_user FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 16 — Patient schedule anchors (wake / sleep / meals)
-- Defaults per D-B: wake 08:00, sleep 22:00, breakfast 07:30, lunch 12:00, dinner 19:00
CREATE TABLE IF NOT EXISTS patient_anchors (
  patient_id       CHAR(36)   NOT NULL,
  wake_anchor      TIME       NOT NULL DEFAULT '08:00:00',
  sleep_anchor     TIME       NOT NULL DEFAULT '22:00:00',
  breakfast_anchor TIME       NOT NULL DEFAULT '07:30:00',
  lunch_anchor     TIME       NOT NULL DEFAULT '12:00:00',
  dinner_anchor    TIME       NOT NULL DEFAULT '19:00:00',
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (patient_id),
  CONSTRAINT fk_anchors_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 17 — Pharmacy branches
CREATE TABLE IF NOT EXISTS pharmacy_branches (
  id                   CHAR(36)     NOT NULL DEFAULT (UUID()),
  name                 VARCHAR(255) NOT NULL,
  address              TEXT         NOT NULL,
  hours_json           JSON,        -- {"mon":{"open":"08:00","close":"20:00"}, ...}
  services_json        JSON,        -- ["dispensing","consultation","delivery"]
  delivery_coverage    TEXT,        -- plain description of coverage area
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 18 — Pharmacists
CREATE TABLE IF NOT EXISTS pharmacists (
  id              CHAR(36)     NOT NULL,  -- FK → users.id
  full_name       VARCHAR(255) NOT NULL,
  license_number  VARCHAR(100),
  branch_id       CHAR(36),
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_pharmacists_user   FOREIGN KEY (id)        REFERENCES users (id)              ON DELETE CASCADE,
  CONSTRAINT fk_pharmacists_branch FOREIGN KEY (branch_id) REFERENCES pharmacy_branches (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 19 — Caregivers
CREATE TABLE IF NOT EXISTS caregivers (
  id         CHAR(36)     NOT NULL,  -- FK → users.id
  full_name  VARCHAR(255) NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_caregivers_user FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 20 — Admins
CREATE TABLE IF NOT EXISTS admins (
  id         CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_admins_user FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patient ↔ Caregiver linking (invite-code based, D-G)
CREATE TABLE IF NOT EXISTS caregiver_patients (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  caregiver_id CHAR(36)    NOT NULL,
  patient_id   CHAR(36)    NOT NULL,
  linked_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_caregiver_patient (caregiver_id, patient_id),
  CONSTRAINT fk_cp_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers (id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_patient   FOREIGN KEY (patient_id)   REFERENCES patients (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-use invite codes generated by patients for caregivers (D-G: 8 chars, 24h TTL)
CREATE TABLE IF NOT EXISTS invite_codes (
  id         CHAR(36)    NOT NULL DEFAULT (UUID()),
  patient_id CHAR(36)    NOT NULL,
  code       CHAR(8)     NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used       TINYINT(1)  NOT NULL DEFAULT 0,
  used_at    DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_invite_code (code),
  CONSTRAINT fk_invite_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- JWT refresh token table (D-G)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         CHAR(36)    NOT NULL DEFAULT (UUID()),
  user_id    CHAR(36)    NOT NULL,
  token_hash VARCHAR(255) NOT NULL,   -- SHA-256 of the raw refresh token
  expires_at DATETIME(3) NOT NULL,
  revoked    TINYINT(1)  NOT NULL DEFAULT 0,
  revoked_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_hash (token_hash(64)),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── DRUG REFERENCE (pharmacist-curated formulary) ────────────────────────────

-- Table 21 — Drug reference / formulary
-- Engine deltas: min_interval_hours (same-drug), max_daily_doses, frequency_default
CREATE TABLE IF NOT EXISTS drug_reference (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()),
  generic_name      VARCHAR(255) NOT NULL,
  brand_names_json  JSON,                   -- ["Biogesic","Tempra"]
  category          VARCHAR(100),
  is_restricted     TINYINT(1)   NOT NULL DEFAULT 0,
  min_interval_hours DECIMAL(5,2),          -- minimum hours between doses of this drug (ENG §5)
  max_daily_doses   TINYINT UNSIGNED,       -- max doses per 24-hour window (ENG §5)
  frequency_default VARCHAR(100),           -- e.g. "TID", "q8h" (informational)
  availability      TINYINT(1)   NOT NULL DEFAULT 1,  -- per-medicine toggle (D-7)
  verified_by       CHAR(36),              -- pharmacist id
  verified_at       DATETIME(3),
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_drug_generic (generic_name),
  CONSTRAINT fk_drug_verified_by FOREIGN KEY (verified_by) REFERENCES pharmacists (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 22 — Drug interaction pairs (pharmacist-curated)
-- Engine delta: min_gap_hours enforced by the engine cross-drug constraint (ENG §5)
CREATE TABLE IF NOT EXISTS drug_interactions (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  drug_a_id     CHAR(36)     NOT NULL,
  drug_b_id     CHAR(36)     NOT NULL,
  min_gap_hours DECIMAL(5,2) NOT NULL,      -- minimum hours between any dose of A and any dose of B
  severity      ENUM('low','moderate','high','contraindicated') NOT NULL DEFAULT 'moderate',
  notes         TEXT,
  verified_by   CHAR(36),
  verified_at   DATETIME(3),
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_interaction_pair (drug_a_id, drug_b_id),
  CONSTRAINT fk_di_drug_a      FOREIGN KEY (drug_a_id)   REFERENCES drug_reference (id) ON DELETE CASCADE,
  CONSTRAINT fk_di_drug_b      FOREIGN KEY (drug_b_id)   REFERENCES drug_reference (id) ON DELETE CASCADE,
  CONSTRAINT fk_di_verified_by FOREIGN KEY (verified_by) REFERENCES pharmacists (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── MEDICATIONS & PRESCRIPTIONS ─────────────────────────────────────────────

-- Table 23 — Medications (patient's active medications)
-- Engine deltas: frequency_code (normalized token), is_prn
CREATE TABLE IF NOT EXISTS medications (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  patient_id         CHAR(36)      NOT NULL,
  drug_id            CHAR(36),     -- NULL if drug is uncurated / pending
  drug_name_raw      VARCHAR(255)  NOT NULL,  -- as the patient/pharmacist typed it
  source             ENUM('RX_VALIDATED','OTC_SELF') NOT NULL,
  is_prn             TINYINT(1)    NOT NULL DEFAULT 0,
  frequency          VARCHAR(255),             -- raw frequency text (e.g. "three times daily")
  frequency_code     VARCHAR(100),             -- normalized token (e.g. "TID", "MEALMAP(1,0,1)")
  dosage_instruction TEXT,
  start_date         DATE,
  end_date           DATE,
  status             ENUM('pending_validation','pending_drug','active','completed','cancelled') NOT NULL DEFAULT 'pending_validation',
  pharmacist_id      CHAR(36),                -- who validated the prescription
  validated_at       DATETIME(3),
  prescription_photo_id CHAR(36),
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_med_patient (patient_id),
  KEY idx_med_drug    (drug_id),
  CONSTRAINT fk_med_patient     FOREIGN KEY (patient_id)    REFERENCES patients     (id) ON DELETE CASCADE,
  CONSTRAINT fk_med_drug        FOREIGN KEY (drug_id)       REFERENCES drug_reference(id) ON DELETE SET NULL,
  CONSTRAINT fk_med_pharmacist  FOREIGN KEY (pharmacist_id) REFERENCES pharmacists  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 24 — Prescription photos (lifecycle: purge 7 days post-decision, D-K)
CREATE TABLE IF NOT EXISTS prescription_photos (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  medication_id   CHAR(36)     NOT NULL,
  redacted_path   VARCHAR(500),             -- path inside UPLOADS_DIR; NULL = not yet uploaded
  status          ENUM('pending','approved','rejected','needs_clearer') NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  pharmacist_id   CHAR(36),
  decision_at     DATETIME(3),
  purge_at        DATETIME(3),              -- set to decision_at + 7 days on decision
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_photo_medication  FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_pharmacist  FOREIGN KEY (pharmacist_id) REFERENCES pharmacists (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pending drug curation requests (D-D: unknown drugs block scheduling)
CREATE TABLE IF NOT EXISTS pending_drug_requests (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  patient_id   CHAR(36)    NOT NULL,
  medication_id CHAR(36),
  drug_name_raw VARCHAR(255) NOT NULL,
  frequency_raw VARCHAR(255),
  status       ENUM('pending','curated','rejected') NOT NULL DEFAULT 'pending',
  resolved_at  DATETIME(3),
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_pdr_patient    FOREIGN KEY (patient_id)    REFERENCES patients    (id) ON DELETE CASCADE,
  CONSTRAINT fk_pdr_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── SCHEDULE ENGINE ──────────────────────────────────────────────────────────

-- Table 25 — Medication schedules (engine output)
-- Engine deltas: schedule_version, generated_reason, is_confirmed (patient-only, E-3)
CREATE TABLE IF NOT EXISTS medication_schedules (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  medication_id    CHAR(36)     NOT NULL,
  patient_id       CHAR(36)     NOT NULL,
  scheduled_time   DATETIME(3)  NOT NULL,   -- absolute UTC datetime of this dose
  generated_reason VARCHAR(500) NOT NULL,   -- why the engine placed it here
  is_confirmed     TINYINT(1)   NOT NULL DEFAULT 0,
  is_prn_slot      TINYINT(1)   NOT NULL DEFAULT 0,
  schedule_version SMALLINT UNSIGNED NOT NULL DEFAULT 1, -- increments on every regeneration
  status           ENUM('scheduled','taken','taken_late','missed','snoozed','skipped') NOT NULL DEFAULT 'scheduled',
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sched_patient  (patient_id, scheduled_time),
  KEY idx_sched_med      (medication_id),
  CONSTRAINT fk_sched_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE,
  CONSTRAINT fk_sched_patient    FOREIGN KEY (patient_id)    REFERENCES patients    (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 26 — Dose logs (append-only; offline outbox synced on reconnect, D-F)
CREATE TABLE IF NOT EXISTS dose_logs (
  id                  CHAR(36)    NOT NULL DEFAULT (UUID()),
  schedule_id         CHAR(36)    NOT NULL,
  patient_id          CHAR(36)    NOT NULL,
  logged_at           DATETIME(3) NOT NULL,            -- when the patient confirmed/missed
  confirmation_method ENUM('fcm','local','manual','ocr') NOT NULL,
  status              ENUM('taken','taken_late','missed','snoozed','duplicate') NOT NULL,
  notes               TEXT,
  synced              TINYINT(1)  NOT NULL DEFAULT 1,  -- 0 = in offline outbox, 1 = server-side
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_log_patient   (patient_id, logged_at),
  KEY idx_log_schedule  (schedule_id),
  CONSTRAINT fk_log_schedule FOREIGN KEY (schedule_id) REFERENCES medication_schedules (id) ON DELETE CASCADE,
  CONSTRAINT fk_log_patient  FOREIGN KEY (patient_id)  REFERENCES patients             (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── TIER 2 FEATURES ─────────────────────────────────────────────────────────

-- Table 27 — Inquiry threads (Ask Your Pharmacist, S8)
-- Server holds thread only while open; purges messages on close (D-I)
CREATE TABLE IF NOT EXISTS inquiry_threads (
  id            CHAR(36)    NOT NULL DEFAULT (UUID()),
  patient_id    CHAR(36)    NOT NULL,
  pharmacist_id CHAR(36),
  branch_id     CHAR(36),
  status        ENUM('open','closed') NOT NULL DEFAULT 'open',
  opened_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at     DATETIME(3),
  PRIMARY KEY (id),
  KEY idx_thread_patient    (patient_id),
  KEY idx_thread_pharmacist (pharmacist_id),
  CONSTRAINT fk_thread_patient    FOREIGN KEY (patient_id)    REFERENCES patients          (id) ON DELETE CASCADE,
  CONSTRAINT fk_thread_pharmacist FOREIGN KEY (pharmacist_id) REFERENCES pharmacists       (id) ON DELETE SET NULL,
  CONSTRAINT fk_thread_branch     FOREIGN KEY (branch_id)     REFERENCES pharmacy_branches (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inquiry messages — purged on thread close (device retains local history)
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id          CHAR(36)    NOT NULL DEFAULT (UUID()),
  thread_id   CHAR(36)    NOT NULL,
  sender_role ENUM('patient','pharmacist') NOT NULL,
  message     TEXT        NOT NULL,
  sent_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_msg_thread (thread_id),
  CONSTRAINT fk_msg_thread FOREIGN KEY (thread_id) REFERENCES inquiry_threads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 28 — Refill & delivery requests (S9, request + status tracking only, D-4)
CREATE TABLE IF NOT EXISTS refill_requests (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  patient_id   CHAR(36)    NOT NULL,
  medication_id CHAR(36)   NOT NULL,
  branch_id    CHAR(36)    NOT NULL,
  status       ENUM('pending','processing','ready','cancelled') NOT NULL DEFAULT 'pending',
  notes        TEXT,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_refill_patient    FOREIGN KEY (patient_id)    REFERENCES patients          (id) ON DELETE CASCADE,
  CONSTRAINT fk_refill_medication FOREIGN KEY (medication_id) REFERENCES medications       (id) ON DELETE CASCADE,
  CONSTRAINT fk_refill_branch     FOREIGN KEY (branch_id)     REFERENCES pharmacy_branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delivery_requests (
  id                  CHAR(36)    NOT NULL DEFAULT (UUID()),
  patient_id          CHAR(36)    NOT NULL,
  medication_id       CHAR(36)    NOT NULL,
  branch_id           CHAR(36)    NOT NULL,
  delivery_address_enc TEXT,       -- AES-256-GCM of delivery address
  status              ENUM('pending','processing','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'pending',
  notes               TEXT,
  requested_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_del_patient    FOREIGN KEY (patient_id)    REFERENCES patients          (id) ON DELETE CASCADE,
  CONSTRAINT fk_del_medication FOREIGN KEY (medication_id) REFERENCES medications       (id) ON DELETE CASCADE,
  CONSTRAINT fk_del_branch     FOREIGN KEY (branch_id)     REFERENCES pharmacy_branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 29 — SUS & TAM survey responses (S7 instrumentation)
CREATE TABLE IF NOT EXISTS sus_responses (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  user_id        CHAR(36)    NOT NULL,
  role           ENUM('patient','pharmacist','caregiver','admin') NOT NULL,
  responses_json JSON        NOT NULL,  -- {"q1":4,"q2":3,...,"q10":5}
  submitted_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tam_responses (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  user_id        CHAR(36)    NOT NULL,
  role           ENUM('patient','pharmacist','caregiver','admin') NOT NULL,
  responses_json JSON        NOT NULL,
  submitted_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
