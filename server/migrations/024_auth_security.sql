-- Harden unified authentication without replacing PharMate's UUID identity model.
-- Existing role-specific profile tables remain the source of names/PII.

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL,
  ADD COLUMN google_id VARCHAR(255) NULL AFTER password_hash,
  ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER role,
  ADD COLUMN failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_verified,
  ADD COLUMN account_locked_until DATETIME(3) NULL AFTER failed_login_attempts,
  ADD UNIQUE KEY uq_users_google_id (google_id),
  ADD KEY idx_users_lockout (account_locked_until);

UPDATE users SET is_verified = 1;

CREATE TABLE IF NOT EXISTS password_reset_pins (
  id          CHAR(36)    NOT NULL,
  user_id     CHAR(36)    NOT NULL,
  pin_hash    VARCHAR(255) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used        TINYINT(1)  NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reset_pin_user_current (user_id, used, created_at),
  CONSTRAINT fk_password_reset_pin_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
