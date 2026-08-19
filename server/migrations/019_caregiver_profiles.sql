CREATE TABLE IF NOT EXISTS caregiver_profiles (
  caregiver_id    CHAR(36) NOT NULL,
  display_name_enc TEXT NULL,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (caregiver_id),
  CONSTRAINT fk_caregiver_profile_user FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
