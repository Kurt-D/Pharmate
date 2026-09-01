-- Canonical, single-use PIN recovery records.
-- PharMate uses UUID user identifiers, so user_id intentionally matches users.id.
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     CHAR(36) NOT NULL,
  pin_hash    VARCHAR(255) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_used     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_password_resets_user_current (user_id, is_used, created_at),
  CONSTRAINT fk_password_resets_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
