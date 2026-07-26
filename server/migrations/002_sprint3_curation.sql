-- PharMate Migration 002 — Sprint 3 curation deltas
-- Adds the modeling the pharmacist curation sheet requires:
--   1. interaction_type on drug_interactions — not every interaction is fixable by
--      spacing. Some pairs are "avoid" (duplicate therapy / renal risk) or "monitor"
--      (mask hypoglycemia) with NO min_gap_hours. The engine must distinguish these.
--   2. restricted_substances — controlled/DDB-regulated list for the TC-11 redirect.
--   3. is_provisional on drug_reference — supports the R1 fallback: data may be
--      seeded UNVERIFIED (verified_by IS NULL) now and signed by the pharmacist later.

SET time_zone = '+08:00';
SET NAMES utf8mb4;

-- ─── 1. Interaction typing ────────────────────────────────────────────────────
-- min_gap_hours becomes nullable: AVOID / MONITOR / NONE rows carry no gap.
ALTER TABLE drug_interactions
  MODIFY COLUMN min_gap_hours DECIMAL(5,2) NULL;

-- SPACING  — stagger by min_gap_hours (e.g. paracetamol ↔ ibuprofen, 1h)
-- AVOID    — do not co-schedule; spacing does not resolve (duplicate therapy, renal)
-- MONITOR  — allowed, clinical caution only (e.g. beta-blocker masking hypoglycemia)
-- NONE     — explicitly checked, no documented gap (recorded decision, not omission)
ALTER TABLE drug_interactions
  ADD COLUMN interaction_type ENUM('SPACING','AVOID','MONITOR','NONE')
    NOT NULL DEFAULT 'SPACING' AFTER min_gap_hours;

-- Sheet severity vocabulary is richer than the original enum; widen it so the
-- loader can map faithfully (mild→low, moderate-severe→high, none checked→none).
ALTER TABLE drug_interactions
  MODIFY COLUMN severity
    ENUM('none','low','moderate','high','contraindicated') NOT NULL DEFAULT 'moderate';

-- ─── 2. Restricted substances (TC-11) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restricted_substances (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  generic_name   VARCHAR(255) NOT NULL,
  category       VARCHAR(100),                    -- e.g. 'DDB-regulated', 'controlled'
  reason         TEXT,
  is_provisional TINYINT(1)   NOT NULL DEFAULT 1, -- placeholder until pharmacist confirms
  verified_by    CHAR(36),
  verified_at    DATETIME(3),
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_restricted_generic (generic_name),
  CONSTRAINT fk_restricted_verified_by
    FOREIGN KEY (verified_by) REFERENCES pharmacists (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. Missing ENG §3.1 columns on drug_reference ────────────────────────────
-- The curation sheet carries these but migration 001 omitted them.
ALTER TABLE drug_reference
  ADD COLUMN is_prn_default        TINYINT(1)  NOT NULL DEFAULT 0 AFTER max_daily_doses,
  ADD COLUMN default_interval_hours DECIMAL(5,2) NULL          AFTER is_prn_default,
  ADD COLUMN meal_anchor_code      ENUM('NONE','AC','PC','WITH_MEAL','HS')
    NOT NULL DEFAULT 'NONE' AFTER default_interval_hours,
  ADD COLUMN meal_instruction      VARCHAR(255) NULL           AFTER meal_anchor_code,
  ADD COLUMN notes                 TEXT NULL                   AFTER meal_instruction;

-- ─── 4. Provisional flag for R1 fallback ──────────────────────────────────────
-- verified_by IS NULL already means "unsigned"; is_provisional makes intent
-- explicit and lets staff views flag rows the pharmacist must still ratify.
ALTER TABLE drug_reference
  ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0 AFTER verified_at;

ALTER TABLE drug_interactions
  ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0 AFTER verified_at;
