ALTER TABLE payments
  ADD COLUMN status_token_hash CHAR(64) NULL AFTER competencia,
  ADD COLUMN status_token_expires_at DATETIME NULL AFTER status_token_hash,
  ADD INDEX payments_status_token_idx (status_token_hash);
