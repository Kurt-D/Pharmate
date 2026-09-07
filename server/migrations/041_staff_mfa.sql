-- TOTP is mandatory for privileged interactive sessions in production.
-- Secrets are encrypted by the application before storage.
ALTER TABLE users
  ADD COLUMN mfa_secret_enc TEXT NULL AFTER account_locked_until,
  ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER mfa_secret_enc,
  ADD COLUMN mfa_last_counter BIGINT NULL AFTER mfa_enabled;

