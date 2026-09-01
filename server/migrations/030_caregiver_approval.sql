ALTER TABLE caregiver_patients
  MODIFY COLUMN status ENUM('pending','active','rejected','revoked') NOT NULL DEFAULT 'active';

ALTER TABLE caregiver_link_audit
  MODIFY COLUMN event_type ENUM('requested','approved','rejected','linked','relinked','revoked') NOT NULL;
