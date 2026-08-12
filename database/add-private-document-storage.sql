ALTER TABLE customer_document_files
  MODIFY COLUMN base64_data MEDIUMTEXT NULL,
  ADD COLUMN storage_driver VARCHAR(20) NULL AFTER base64_data,
  ADD COLUMN storage_key VARCHAR(255) NULL AFTER storage_driver,
  ADD COLUMN file_size BIGINT UNSIGNED NULL AFTER storage_key,
  ADD COLUMN sha256 CHAR(64) NULL AFTER file_size,
  ADD UNIQUE KEY customer_document_files_storage_key_unique (storage_key);
