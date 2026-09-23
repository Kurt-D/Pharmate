-- Track refresh-token rotation chains so replay of an old token can revoke
-- every descendant issued from the same authenticated session.
ALTER TABLE refresh_tokens
  ADD COLUMN family_id CHAR(36) NULL AFTER user_id,
  ADD COLUMN replaced_by_id CHAR(36) NULL AFTER revoked_at,
  ADD KEY idx_refresh_family (family_id, revoked),
  ADD KEY idx_refresh_replacement (replaced_by_id);

UPDATE refresh_tokens SET family_id=id WHERE family_id IS NULL;

ALTER TABLE refresh_tokens
  MODIFY family_id CHAR(36) NOT NULL;
