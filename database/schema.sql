CREATE DATABASE IF NOT EXISTS facilita_modern
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE facilita_modern;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL,
  telefone VARCHAR(30) NULL,
  whatsapp VARCHAR(30) NULL,
  documento VARCHAR(20) NULL,
  cnpj VARCHAR(20) NULL,
  senha_hash VARCHAR(180) NULL,
  senha_salt VARCHAR(80) NULL,
  cliente_login_ativo TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('pending', 'active', 'blocked', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY users_email_unique (email)
);

CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(60) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  valor DECIMAL(10,2) NOT NULL,
  frequencia INT NOT NULL DEFAULT 1,
  tipo_frequencia ENUM('days', 'months') NOT NULL DEFAULT 'months',
  servico VARCHAR(120) NOT NULL,
  mercado_pago_plan_id VARCHAR(120) NULL COMMENT 'preapproval_plan_id retornado pelo Mercado Pago',
  tipo_cobranca ENUM('single', 'subscription') NOT NULL DEFAULT 'subscription',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_features (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id VARCHAR(60) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY plan_features_plan_ordem_unique (plan_id, ordem),
  KEY plan_features_plan_idx (plan_id),
  CONSTRAINT plan_features_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id VARCHAR(60) NOT NULL,
  mercado_pago_subscription_id VARCHAR(120) NOT NULL,
  status ENUM('pending', 'authorized', 'active', 'paused', 'cancelled', 'expired', 'rejected') NOT NULL DEFAULT 'pending',
  valor DECIMAL(10,2) NOT NULL,
  data_inicio DATETIME NULL,
  data_proxima_cobranca DATETIME NULL,
  metodo_pagamento VARCHAR(40) NULL,
  init_point TEXT NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY subscriptions_mp_id_unique (mercado_pago_subscription_id),
  KEY subscriptions_user_idx (user_id),
  KEY subscriptions_plan_idx (plan_id),
  KEY subscriptions_status_idx (status),
  CONSTRAINT subscriptions_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT subscriptions_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  mercado_pago_payment_id VARCHAR(120) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  data_pagamento DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_payload JSON NULL,
  UNIQUE KEY payments_mp_id_unique (mercado_pago_payment_id),
  KEY payments_user_idx (user_id),
  KEY payments_subscription_idx (subscription_id),
  KEY payments_status_idx (status),
  CONSTRAINT payments_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT payments_subscription_fk FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

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

INSERT INTO plans
  (id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca, ativo, ordem)
VALUES
  ('start-mei', 'Start MEI', 'Orientacao inicial, ate 3 NFS-e por mes e PGDAS anual.', 89.99, 1, 'months', 'mei_start', NULL, 'subscription', 1, 10),
  ('servicos', 'Facilita MEI Servicos', 'Ate 10 NFS-e por mes, suporte e PGDAS anual.', 99.99, 1, 'months', 'mei_servicos', NULL, 'subscription', 1, 20),
  ('premium', 'Facilita Premium', 'Ate 20 NFS-e por mes, contador e certificado digital PF.', 149.99, 1, 'months', 'mei_premium', NULL, 'subscription', 1, 30),
  ('comercio', 'Facilita MEI Comercio', 'Ate 10 notas fiscais, suporte, PGDAS e inscricao estadual.', 110.00, 1, 'months', 'mei_comercio', NULL, 'subscription', 1, 40),
  ('full', 'Facilita MEI Full', 'Abertura completa, NFS-e ilimitada, funcionario ou pro-labore.', 199.99, 1, 'months', 'mei_full', NULL, 'subscription', 1, 50)
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome),
  descricao = VALUES(descricao),
  valor = VALUES(valor),
  frequencia = VALUES(frequencia),
  tipo_frequencia = VALUES(tipo_frequencia),
  servico = VALUES(servico),
  mercado_pago_plan_id = VALUES(mercado_pago_plan_id),
  tipo_cobranca = VALUES(tipo_cobranca),
  ativo = VALUES(ativo),
  ordem = VALUES(ordem);

INSERT INTO plan_features (plan_id, descricao, ordem, ativo)
VALUES
  ('start-mei', 'Ideal para quem ja possui MEI aberto', 10, 1),
  ('start-mei', 'CNPJ ja aberto', 20, 1),
  ('start-mei', 'Orientacao inicial', 30, 1),
  ('start-mei', 'Emissao de ate 3 NFS-e por mes', 40, 1),
  ('start-mei', 'PGDAS anual', 50, 1),
  ('servicos', 'Perfeito para prestadores de servicos com MEI aberto', 10, 1),
  ('servicos', 'Emissao de ate 10 NFS-e por mes', 20, 1),
  ('servicos', 'Suporte e orientacao com a equipe', 30, 1),
  ('servicos', 'PGDAS anual', 40, 1),
  ('premium', 'Emissao de ate 20 NFS-e por mes', 10, 1),
  ('premium', 'Suporte e orientacao com contador', 20, 1),
  ('premium', 'PGDAS anual', 30, 1),
  ('premium', 'Certificado Digital Pessoa Fisica de brinde (Bird ID)', 40, 1),
  ('comercio', 'Emissao de ate 10 notas fiscais', 10, 1),
  ('comercio', 'Suporte e orientacao com a equipe', 20, 1),
  ('comercio', 'Abertura de inscricao estadual', 30, 1),
  ('comercio', 'Acrescimo de R$ 249,99 no primeiro mes caso nao possua inscricao estadual', 40, 1),
  ('comercio', 'PGDAS anual', 50, 1),
  ('full', 'Abertura completa do MEI', 10, 1),
  ('full', 'Emissao ilimitada de NFS-e', 20, 1),
  ('full', 'Registro de 1 funcionario ou pro-labore', 30, 1),
  ('full', 'Suporte com contador', 40, 1),
  ('full', 'PGDAS anual', 50, 1),
  ('full', 'Declaracao anual do MEI', 60, 1),
  ('full', 'Certificado Digital Pessoa Fisica de brinde (Bird ID)', 70, 1)
ON DUPLICATE KEY UPDATE
  descricao = VALUES(descricao),
  ativo = VALUES(ativo);
