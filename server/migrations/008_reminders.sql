-- PharMate Migration 008 — reminder dispatch marker
--
-- The reminder pipeline (feature #4) sends one online FCM push per due dose. To
-- keep dispatch idempotent — a dose is reminded exactly once even though the cron
-- job scans every minute — we stamp the schedule row when its reminder goes out.
-- A NULL marker means "not yet reminded"; the dispatcher only ever selects those.
--
-- No table is needed: one dose = at most one reminder, so the flag lives on the
-- schedule row itself (mirrors how status already tracks the dose lifecycle).

SET NAMES utf8mb4;

ALTER TABLE medication_schedules
  ADD COLUMN reminder_sent_at DATETIME(3) NULL DEFAULT NULL AFTER status;

-- The dispatcher scans by (status, scheduled_time) for un-reminded scheduled doses.
CREATE INDEX idx_sched_reminder ON medication_schedules (status, reminder_sent_at, scheduled_time);
