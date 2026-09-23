-- A consultation is archived only after both participants have confirmed completion.
ALTER TABLE inquiry_threads
  ADD COLUMN patient_completed_at DATETIME(3) NULL AFTER closed_at,
  ADD COLUMN pharmacist_completed_at DATETIME(3) NULL AFTER patient_completed_at;
