-- Request context makes staff access records actionable during an investigation.
-- No request bodies, messages, tokens, passwords, or prescription data are stored.
ALTER TABLE audit_events
  ADD COLUMN request_id CHAR(36) NULL AFTER patient_id,
  ADD COLUMN source_ip VARCHAR(45) NULL AFTER request_id,
  ADD COLUMN outcome ENUM('success','failure') NOT NULL DEFAULT 'success' AFTER source_ip;

CREATE INDEX idx_audit_request ON audit_events (request_id, created_at);
CREATE INDEX idx_audit_action_outcome ON audit_events (action, outcome, created_at);
