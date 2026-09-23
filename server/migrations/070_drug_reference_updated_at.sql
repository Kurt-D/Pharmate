-- The administrative medication lifecycle exposes last-updated metadata.
-- Legacy drug-reference records had only a creation timestamp.
ALTER TABLE drug_reference
  ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at;
