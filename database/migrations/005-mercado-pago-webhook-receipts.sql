CREATE TABLE mercado_pago_webhook_receipts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_id CHAR(36) NOT NULL,
  request_id VARCHAR(120) NULL,
  topic VARCHAR(120) NOT NULL,
  resource_id VARCHAR(180) NULL,
  signature_present TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('accepted', 'processed', 'rejected', 'ignored', 'failed') NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  error_code VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY mercado_pago_receipt_id_unique (receipt_id),
  KEY mercado_pago_receipt_created_idx (created_at),
  KEY mercado_pago_receipt_status_created_idx (status, created_at)
);
