-- Allow pharmacy orders to reference the catalog directly. Ordering a product
-- must not require or create a medication/schedule record.
ALTER TABLE refill_requests
  MODIFY medication_id CHAR(36) NULL,
  ADD COLUMN drug_id CHAR(36) NULL AFTER medication_id,
  ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER drug_id,
  ADD COLUMN placed_by_user_id CHAR(36) NULL AFTER patient_id,
  ADD COLUMN caregiver_id CHAR(36) NULL AFTER placed_by_user_id,
  ADD CONSTRAINT fk_refill_drug FOREIGN KEY (drug_id) REFERENCES drug_reference(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_refill_placed_by FOREIGN KEY (placed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_refill_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers(id) ON DELETE SET NULL;

ALTER TABLE delivery_requests
  MODIFY medication_id CHAR(36) NULL,
  ADD COLUMN drug_id CHAR(36) NULL AFTER medication_id,
  ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1 AFTER drug_id,
  ADD COLUMN placed_by_user_id CHAR(36) NULL AFTER patient_id,
  ADD COLUMN caregiver_id CHAR(36) NULL AFTER placed_by_user_id,
  ADD CONSTRAINT fk_delivery_drug FOREIGN KEY (drug_id) REFERENCES drug_reference(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_delivery_placed_by FOREIGN KEY (placed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_delivery_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers(id) ON DELETE SET NULL;

CREATE TABLE order_prescriptions (
  id CHAR(36) NOT NULL,
  order_kind ENUM('refill','delivery') NOT NULL,
  order_id CHAR(36) NOT NULL,
  patient_id CHAR(36) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected','needs_resubmission') NOT NULL DEFAULT 'pending',
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_prescription (order_kind, order_id),
  KEY idx_order_rx_review (status, created_at),
  CONSTRAINT fk_order_rx_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_rx_reviewer FOREIGN KEY (reviewed_by) REFERENCES pharmacists(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

