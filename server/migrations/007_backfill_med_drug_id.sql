-- PharMate Migration 007 — backfill medications.drug_id
--
-- Historical medications encoded before the drug resolved (or via the old
-- self-declared OTC path) can have a NULL drug_id. Without it, the formulary
-- join yields no rx_class, so an Rx drug wrongly classifies as OTC in the Orders
-- tabs and slips past the UC-09 gate. Repair those rows by resolving the raw
-- name to a curated drug — mirroring services/formulary.js resolveDrug()
-- (canonical = lowercased, trimmed generic name; prefer verified over
-- provisional, then oldest).
--
-- No-op on a fresh DB (CI migrates before seeding, so there are no medications
-- yet). Genuinely uncurated drugs (no formulary match) are left NULL.

SET NAMES utf8mb4;

UPDATE medications m
   SET m.drug_id = (
     SELECT dr.id FROM drug_reference dr
      WHERE dr.generic_name = LOWER(TRIM(m.drug_name_raw))
      ORDER BY dr.is_provisional ASC, dr.created_at ASC
      LIMIT 1
   )
 WHERE m.drug_id IS NULL
   AND EXISTS (
     SELECT 1 FROM drug_reference dr2
      WHERE dr2.generic_name = LOWER(TRIM(m.drug_name_raw))
   );
