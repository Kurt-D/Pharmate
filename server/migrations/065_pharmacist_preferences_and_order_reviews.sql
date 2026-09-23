CREATE TABLE pharmacist_preferences (
  pharmacist_id CHAR(36) NOT NULL,
  urgent_alerts_enabled TINYINT(1) NOT NULL DEFAULT 1,
  daily_summary_enabled TINYINT(1) NOT NULL DEFAULT 1,
  compact_queue_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (pharmacist_id),
  CONSTRAINT fk_pharmacist_preferences_owner FOREIGN KEY (pharmacist_id) REFERENCES pharmacists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_prescriptions
  ADD COLUMN claim_by CHAR(36) NULL AFTER reviewed_by,
  ADD COLUMN claim_expires_at DATETIME(3) NULL AFTER claim_by,
  ADD COLUMN review_reason TEXT NULL AFTER reviewed_at,
  ADD COLUMN reviewer_license_number VARCHAR(120) NULL AFTER review_reason,
  ADD CONSTRAINT fk_order_rx_claimant FOREIGN KEY (claim_by) REFERENCES pharmacists(id) ON DELETE SET NULL;

CREATE TABLE order_prescription_history (
  id CHAR(36) NOT NULL,
  prescription_id CHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  reason TEXT NULL,
  changed_by CHAR(36) NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_rx_history (prescription_id, changed_at),
  CONSTRAINT fk_order_rx_history_prescription FOREIGN KEY (prescription_id) REFERENCES order_prescriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_rx_history_actor FOREIGN KEY (changed_by) REFERENCES pharmacists(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
