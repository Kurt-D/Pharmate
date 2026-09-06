ALTER TABLE patient_anchors
  ADD COLUMN IF NOT EXISTS profile_completed TINYINT(1) NOT NULL DEFAULT 0 AFTER dinner_anchor;

