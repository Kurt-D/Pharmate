ALTER TABLE patient_anchors
  ADD COLUMN profile_completed TINYINT(1) NOT NULL DEFAULT 0 AFTER dinner_anchor;
