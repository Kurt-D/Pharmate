CREATE TABLE IF NOT EXISTS ph_fda_drug_products (
  registration_number VARCHAR(100) NOT NULL,
  generic_name VARCHAR(500) NOT NULL,
  brand_name VARCHAR(255) NULL,
  dosage_strength VARCHAR(255) NULL,
  dosage_form VARCHAR(255) NULL,
  pharmacologic_category VARCHAR(255) NULL,
  application_type VARCHAR(255) NULL,
  issuance_date DATE NULL,
  expiry_date DATE NULL,
  regulatory_class ENUM('OTC','PENDING_PHARMACIST') NOT NULL,
  source_url VARCHAR(500) NOT NULL DEFAULT 'https://verification.fda.gov.ph/',
  imported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (registration_number),
  KEY idx_ph_fda_generic (generic_name(191)),
  KEY idx_ph_fda_class (regulatory_class, expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
