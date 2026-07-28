-- PharMate Migration 004 — Sprint 8 inquiry priority (B-8)
--
-- Severity-based inquiry priority. A patient's verified chronic-condition
-- severity drives the queue order — never their adherence streak (B-8). The
-- severity lives on the patient; each opened thread snapshots a normal/high
-- priority from it so the pharmacist queue can surface urgent cases first.

SET NAMES utf8mb4;

ALTER TABLE patients
  ADD COLUMN chronic_severity ENUM('none','low','moderate','high')
    NOT NULL DEFAULT 'none' AFTER medical_condition_enc;

ALTER TABLE inquiry_threads
  ADD COLUMN priority ENUM('normal','high') NOT NULL DEFAULT 'normal' AFTER status,
  ADD COLUMN subject  VARCHAR(255) NULL AFTER priority;
