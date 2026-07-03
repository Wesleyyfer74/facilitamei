CREATE TABLE IF NOT EXISTS customer_document_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(180) NOT NULL,
  mime_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
  base64_data MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY customer_document_files_document_unique (document_id),
  CONSTRAINT customer_document_files_document_fk FOREIGN KEY (document_id) REFERENCES customer_documents(id) ON DELETE CASCADE
);
