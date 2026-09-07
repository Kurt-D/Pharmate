ALTER TABLE users
  ADD COLUMN email_verified_at DATETIME(3) NULL AFTER is_verified;

UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at), is_verified = 1;

CREATE TABLE IF NOT EXISTS otp_codes (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  purpose ENUM('PASSWORD_RESET','EMAIL_VERIFICATION') NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_otp_current (user_id, purpose, used_at, created_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

