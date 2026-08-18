-- Opaque, single-use password-reset credentials. Only SHA-256 digests are persisted.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          CHAR(36)    NOT NULL,
  user_id     CHAR(36)    NOT NULL,
  token_hash  CHAR(64)    NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  used_at     DATETIME(3),
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_user_current (user_id, used_at, created_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
