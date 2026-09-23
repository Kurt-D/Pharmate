-- Shared abuse-prevention counters. Keys are SHA-256 digests so email addresses
-- and client network identifiers are never persisted in plaintext.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  key_hash      CHAR(64) NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (key_hash),
  KEY idx_request_rate_limits_reset (reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
