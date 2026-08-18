-- Invalidate access tokens immediately after security-sensitive account changes.
ALTER TABLE users
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_active;
