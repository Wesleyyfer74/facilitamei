CREATE TABLE IF NOT EXISTS customer_document_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(180) NOT NULL,
  mime_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
  base64_data MEDIUMTEXT NULL,
  storage_driver VARCHAR(20) NULL,
  storage_key VARCHAR(255) NULL,
  file_size BIGINT UNSIGNED NULL,
  sha256 CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY customer_document_files_document_unique (document_id),
  UNIQUE KEY customer_document_files_storage_key_unique (storage_key),
  CONSTRAINT customer_document_files_document_fk FOREIGN KEY (document_id) REFERENCES customer_documents(id) ON DELETE CASCADE
);
