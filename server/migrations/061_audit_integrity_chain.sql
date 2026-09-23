-- New audit events are linked to the preceding event. Existing historical
-- records remain readable; the integrity chain begins with this migration.
ALTER TABLE audit_events
  ADD COLUMN previous_hash CHAR(64) NULL AFTER metadata_json,
  ADD COLUMN event_hash CHAR(64) NULL AFTER previous_hash;

CREATE UNIQUE INDEX uq_audit_event_hash ON audit_events (event_hash);

CREATE TABLE IF NOT EXISTS audit_chain_state (
  chain_name VARCHAR(40) NOT NULL,
  last_hash CHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (chain_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO audit_chain_state (chain_name, last_hash) VALUES ('primary', NULL);
