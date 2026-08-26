-- Admin formulary inventory quantity used by the medication operations screen.
-- This is branch-neutral pilot inventory; availability remains the dispensing gate.
ALTER TABLE drug_reference
  ADD COLUMN stock_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER availability;

UPDATE drug_reference SET stock_quantity = 25 WHERE availability = 1 AND stock_quantity = 0;
