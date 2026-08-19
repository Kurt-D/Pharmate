-- Paracetamol is an OTC medicine in the curated formulary. Correct a prior
-- curation entry that classified it as RX, then release affected records from
-- prescription validation so they can be scheduled normally.

UPDATE drug_reference
SET rx_class = 'OTC'
WHERE LOWER(generic_name) = 'paracetamol';

UPDATE medications AS m
INNER JOIN drug_reference AS dr ON dr.id = m.drug_id
SET m.source = 'OTC_SELF',
    m.status = 'active'
WHERE LOWER(dr.generic_name) = 'paracetamol'
  AND m.status = 'pending_validation';
