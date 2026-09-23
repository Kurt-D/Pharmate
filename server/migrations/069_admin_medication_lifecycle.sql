-- Administrative lifecycle for catalog records. Archived medicines remain
-- resolvable by historical orders and patient medication records.
ALTER TABLE drug_reference
  ADD COLUMN admin_status ENUM('ACTIVE','INACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE' AFTER availability,
  ADD KEY idx_drug_admin_status (admin_status);

UPDATE drug_reference
SET admin_status = 'INACTIVE'
WHERE availability = 0;
