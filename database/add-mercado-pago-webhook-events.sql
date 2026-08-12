CREATE TABLE IF NOT EXISTS mercado_pago_webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_key CHAR(64) NOT NULL,
  request_id VARCHAR(180) NOT NULL,
  topic VARCHAR(80) NOT NULL,
  resource_id VARCHAR(180) NOT NULL,
  status ENUM('processing', 'processed', 'failed') NOT NULL DEFAULT 'processing',
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  error_message VARCHAR(1000) NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY mercado_pago_webhook_event_key_unique (event_key),
  KEY mercado_pago_webhook_status_idx (status)
);
