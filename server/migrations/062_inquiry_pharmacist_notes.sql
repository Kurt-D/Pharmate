-- Private working notes for the pharmacist assigned to an inquiry.
-- Notes are not patient messages and are never exposed through patient/admin routes.
CREATE TABLE inquiry_pharmacist_notes (
  id CHAR(36) NOT NULL,
  thread_id CHAR(36) NOT NULL,
  pharmacist_id CHAR(36) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_inquiry_pharmacist_note (thread_id, pharmacist_id),
  CONSTRAINT fk_inquiry_note_thread FOREIGN KEY (thread_id) REFERENCES inquiry_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_inquiry_note_pharmacist FOREIGN KEY (pharmacist_id) REFERENCES pharmacists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
