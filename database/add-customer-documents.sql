CREATE TABLE IF NOT EXISTS customer_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  tipo ENUM('documento', 'contrato', 'proposta', 'termo', 'outro') NOT NULL DEFAULT 'documento',
  status ENUM('pendente', 'enviado', 'assinado', 'aprovado', 'recusado', 'vencido') NOT NULL DEFAULT 'pendente',
  arquivo_url TEXT NULL,
  observacao TEXT NULL,
  data_emissao DATETIME NULL,
  data_assinatura DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY customer_documents_user_idx (user_id),
  KEY customer_documents_status_idx (status),
  KEY customer_documents_tipo_idx (tipo),
  CONSTRAINT customer_documents_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
);
