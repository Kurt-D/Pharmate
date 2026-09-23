-- Transparent queue tiers: clinical need always outranks earned service tokens.
ALTER TABLE inquiry_threads
  ADD COLUMN priority_tier ENUM('standard','token','care','urgent') NOT NULL DEFAULT 'standard' AFTER priority,
  ADD COLUMN priority_reason VARCHAR(255) NULL AFTER priority_tier,
  ADD COLUMN priority_set_by CHAR(36) NULL AFTER priority_reason,
  ADD COLUMN priority_set_at DATETIME(3) NULL AFTER priority_set_by,
  ADD KEY idx_inquiry_queue_priority (status, priority_tier, opened_at),
  ADD CONSTRAINT fk_inquiry_priority_set_by FOREIGN KEY (priority_set_by) REFERENCES pharmacists(id) ON DELETE SET NULL;

-- Preserve existing verified-care priority without inventing a severity score.
UPDATE inquiry_threads SET priority_tier='care', priority_reason='Verified care priority' WHERE priority='high';
