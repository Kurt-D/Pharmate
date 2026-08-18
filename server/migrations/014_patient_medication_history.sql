-- Privacy-conscious audit trail for patient medication lifecycle changes.
CREATE TABLE IF NOT EXISTS medication_history (
  id             CHAR(36) NOT NULL,
  medication_id  CHAR(36) NOT NULL,
  patient_id     CHAR(36) NOT NULL,
  actor_id       CHAR(36) NOT NULL,
  actor_role     ENUM('patient','pharmacist','admin','system') NOT NULL,
  event_type     ENUM('updated','stopped','cancelled') NOT NULL,
  before_info    JSON NULL,
  after_info     JSON NULL,
  event_time     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_med_history_patient (patient_id, event_time DESC, id DESC),
  KEY idx_med_history_medication (medication_id, event_time DESC),
  CONSTRAINT fk_med_history_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE,
  CONSTRAINT fk_med_history_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_med_history_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
