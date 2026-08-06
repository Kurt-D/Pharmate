-- PharMate Migration 006 — authoritative OTC/Rx classification
--
-- Whether a medication requires a prescription is a property of the DRUG (per
-- Philippine FDA classification), not the patient's self-declared `source`. This
-- adds rx_class to the formulary so the UC-09 refill/delivery gate can decide
-- prescription-required status authoritatively.
--
-- Default 'RX' is the safe default: an uncurated/unknown drug is treated as
-- prescription-required until a pharmacist classifies it. OTC drugs are set
-- explicitly below (and by seed-formulary.js for fresh loads).
--
-- Sources: PH FDA drug classification (RA 3720 / RA 9711) — antibiotics,
-- antihypertensives, and chronic-condition drugs are Rx; analgesics,
-- antihistamines, antacids, and oral rehydration are OTC.

SET NAMES utf8mb4;

ALTER TABLE drug_reference
  ADD COLUMN rx_class ENUM('OTC', 'RX') NOT NULL DEFAULT 'RX' AFTER is_restricted;

-- Correct any already-seeded rows (no-op on an empty table, e.g. fresh CI).
UPDATE drug_reference
   SET rx_class = 'OTC'
 WHERE generic_name IN (
   'paracetamol',
   'ibuprofen',
   'mefenamic acid',
   'cetirizine',
   'loratadine',
   'diphenhydramine',
   'oral rehydration salts',
   'loperamide',
   'omeprazole'
 );
