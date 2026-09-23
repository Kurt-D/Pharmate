-- A trusted patient session is still a normal rotating refresh-token session.
-- The flag only controls whether its cookie survives a browser restart.
ALTER TABLE refresh_tokens
  ADD COLUMN persistent TINYINT(1) NOT NULL DEFAULT 1 AFTER family_id,
  ADD COLUMN device_label VARCHAR(160) NULL AFTER persistent,
  ADD COLUMN last_used_at DATETIME(3) NULL AFTER device_label;

CREATE INDEX idx_refresh_user_active ON refresh_tokens (user_id, revoked, expires_at);
