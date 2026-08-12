ALTER TABLE payments
  ADD COLUMN status_token_hash CHAR(64) NULL AFTER competencia;
ALTER TABLE payments
  ADD COLUMN status_token_expires_at DATETIME NULL AFTER status_token_hash;
ALTER TABLE payments
  ADD KEY payments_status_token_idx (status_token_hash);

ALTER TABLE customer_document_files
  MODIFY COLUMN base64_data MEDIUMTEXT NULL;
ALTER TABLE customer_document_files
  ADD COLUMN storage_driver VARCHAR(20) NULL AFTER base64_data;
ALTER TABLE customer_document_files
  ADD COLUMN storage_key VARCHAR(255) NULL AFTER storage_driver;
ALTER TABLE customer_document_files
  ADD COLUMN file_size BIGINT UNSIGNED NULL AFTER storage_key;
ALTER TABLE customer_document_files
  ADD COLUMN sha256 CHAR(64) NULL AFTER file_size;
ALTER TABLE customer_document_files
  ADD UNIQUE KEY customer_document_files_storage_key_unique (storage_key);
