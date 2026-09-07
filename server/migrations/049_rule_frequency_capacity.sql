-- Match drug_reference.frequency_default so coverage synchronization preserves
-- informational directions without truncating them. This does not approve a
-- frequency or change any rule's clinical verification status.
ALTER TABLE medication_rule_variants
  MODIFY COLUMN frequency_code VARCHAR(100) NULL;

ALTER TABLE otc_label_evidence
  MODIFY COLUMN frequency_code VARCHAR(100) NULL;
