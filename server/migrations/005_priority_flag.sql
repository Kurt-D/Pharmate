-- PharMate Migration 005 — priority_flag (compiled-spec PART 2)
--
-- Priority is a BOOLEAN derived from pharmacist prescription validation (UC-03)
-- of a chronic condition — NOT a High/Medium/Low tier, and never a manual
-- toggle. This replaces the chronic_severity ENUM introduced in 004.
--
-- Determination: priority_flag flips true when a licensed pharmacist approves a
-- prescription for a patient who declared a chronic medical_condition at
-- enrollment (see services/prescription.js). The roster shows a two-state badge:
-- Priority vs. Standard.

SET NAMES utf8mb4;

ALTER TABLE patients
  ADD COLUMN priority_flag BOOLEAN NOT NULL DEFAULT 0 AFTER medical_condition_enc;

-- Carry any moderate/high severity forward as a set flag, then drop the ENUM so
-- no multi-tier severity survives anywhere in the schema.
UPDATE patients SET priority_flag = 1 WHERE chronic_severity IN ('moderate', 'high');

ALTER TABLE patients DROP COLUMN chronic_severity;
