CREATE TABLE IF NOT EXISTS portal_notifications (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  action_path VARCHAR(255) NULL,
  event_key VARCHAR(191) NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_notification_event (user_id, event_key),
  KEY idx_portal_notification_unread (user_id, read_at, created_at),
  CONSTRAINT fk_portal_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  actor_user_id CHAR(36) NULL,
  actor_role ENUM('patient','caregiver','pharmacist','admin','system') NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(100) NULL,
  patient_id CHAR(36) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_user_id, created_at),
  KEY idx_audit_patient (patient_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
