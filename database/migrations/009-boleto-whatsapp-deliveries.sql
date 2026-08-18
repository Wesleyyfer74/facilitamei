CREATE TABLE boleto_whatsapp_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  gateway_payment_id VARCHAR(120) NOT NULL,
  recipient VARCHAR(30) NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  status ENUM('sending', 'sent', 'failed') NOT NULL DEFAULT 'sending',
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY boleto_whatsapp_payment_unique (gateway_payment_id),
  KEY boleto_whatsapp_status_created_idx (status, created_at)
);
