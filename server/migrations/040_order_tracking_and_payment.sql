ALTER TABLE refill_requests
  ADD COLUMN payment_method ENUM('CASH_ON_PICKUP','COD','CARD','GCASH') NOT NULL DEFAULT 'CASH_ON_PICKUP' AFTER notes,
  ADD COLUMN payment_status ENUM('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING' AFTER payment_method;

ALTER TABLE delivery_requests
  ADD COLUMN payment_method ENUM('CASH_ON_PICKUP','COD','CARD','GCASH') NOT NULL DEFAULT 'COD' AFTER notes,
  ADD COLUMN payment_status ENUM('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING' AFTER payment_method;

CREATE TABLE order_status_history (
  id CHAR(36) NOT NULL,
  order_kind ENUM('refill','delivery') NOT NULL,
  order_id CHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_by CHAR(36) NULL,
  changed_by_role VARCHAR(24) NOT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_history (order_kind, order_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
