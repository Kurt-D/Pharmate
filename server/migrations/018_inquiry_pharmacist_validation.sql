ALTER TABLE inquiry_threads
  ADD COLUMN requested_pharmacist_id CHAR(36) NULL AFTER branch_id,
  ADD KEY idx_thread_requested_pharmacist (requested_pharmacist_id),
  ADD CONSTRAINT fk_thread_requested_pharmacist
    FOREIGN KEY (requested_pharmacist_id) REFERENCES pharmacists(id) ON DELETE SET NULL;
