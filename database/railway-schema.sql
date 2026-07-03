CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL,
  telefone VARCHAR(30) NULL,
  whatsapp VARCHAR(30) NULL,
  documento VARCHAR(20) NULL,
  cnpj VARCHAR(20) NULL,
  razao_social VARCHAR(180) NULL,
  nome_fantasia VARCHAR(160) NULL,
  data_abertura DATE NULL,
  cep VARCHAR(12) NULL,
  logradouro VARCHAR(180) NULL,
  numero VARCHAR(30) NULL,
  complemento VARCHAR(120) NULL,
  bairro VARCHAR(120) NULL,
  municipio VARCHAR(120) NULL,
  uf VARCHAR(2) NULL,
  cnae_principal_codigo VARCHAR(20) NULL,
  cnae_principal_descricao VARCHAR(255) NULL,
  cnae_secundario_codigo VARCHAR(80) NULL,
  cnae_secundario_descricao VARCHAR(255) NULL,
  capital_social DECIMAL(12,2) NULL,
  inscricao_municipal VARCHAR(60) NULL,
  inscricao_estadual VARCHAR(60) NULL,
  alvara_status VARCHAR(80) NULL,
  banco VARCHAR(120) NULL,
  agencia VARCHAR(30) NULL,
  conta VARCHAR(40) NULL,
  tipo_conta VARCHAR(40) NULL,
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

CREATE TABLE IF NOT EXISTS customer_contracts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  plan_id VARCHAR(60) NULL,
  titulo VARCHAR(160) NOT NULL DEFAULT 'Contrato de Prestacao de Servicos',
  status ENUM('pendente', 'enviado', 'assinado', 'expirado', 'cancelado') NOT NULL DEFAULT 'pendente',
  arquivo_url TEXT NULL,
  assinatura_url TEXT NULL,
  provedor VARCHAR(60) NULL,
  provider_contract_id VARCHAR(160) NULL,
  data_envio DATETIME NULL,
  data_assinatura DATETIME NULL,
  data_expiracao DATETIME NULL,
  observacao TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY customer_contracts_user_idx (user_id),
  KEY customer_contracts_subscription_idx (subscription_id),
  UNIQUE KEY customer_contracts_subscription_unique (subscription_id),
  KEY customer_contracts_plan_idx (plan_id),
  KEY customer_contracts_status_idx (status),
  CONSTRAINT customer_contracts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT customer_contracts_subscription_fk FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  CONSTRAINT customer_contracts_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contract_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(160) NOT NULL DEFAULT 'Contrato de Prestacao de Servicos',
  conteudo LONGTEXT NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY contract_templates_ativo_idx (ativo)
);

CREATE TABLE IF NOT EXISTS contract_reminder_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  dias_primeiro_lembrete INT NOT NULL DEFAULT 2,
  intervalo_dias INT NOT NULL DEFAULT 3,
  max_lembretes INT NOT NULL DEFAULT 3,
  canal_email TINYINT(1) NOT NULL DEFAULT 1,
  canal_whatsapp TINYINT(1) NOT NULL DEFAULT 1,
  mensagem_padrao TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_contract_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  acao VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'registrado',
  destino VARCHAR(160) NULL,
  mensagem TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY customer_contract_events_contract_idx (contract_id),
  KEY customer_contract_events_user_idx (user_id),
  KEY customer_contract_events_acao_idx (acao),
  CONSTRAINT customer_contract_events_contract_fk FOREIGN KEY (contract_id) REFERENCES customer_contracts(id) ON DELETE SET NULL,
  CONSTRAINT customer_contract_events_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO contract_templates (id, nome, conteudo, ativo)
VALUES (
  1,
  'Contrato de Prestacao de Servicos Facilita MEI',
  'CONTRATO DE PRESTACAO DE SERVICOS\n\nCONTRATADA: FACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA.\n\nCONTRATANTE: {{cliente_nome}}\nE-mail: {{cliente_email}}\nPlano contratado: {{plano_nome}}\nValor mensal: {{plano_valor}}\n\nObjeto: prestacao de servicos de assessoria e consultoria para MEI conforme o plano contratado.\n\nEste modelo pode ser ajustado pelo painel administrativo antes do envio ao cliente.',
  1
)
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome),
  conteudo = VALUES(conteudo),
  ativo = VALUES(ativo);

INSERT INTO contract_reminder_settings (id, ativo, dias_primeiro_lembrete, intervalo_dias, max_lembretes, canal_email, canal_whatsapp, mensagem_padrao)
VALUES (
  1,
  1,
  2,
  3,
  3,
  1,
  1,
  'Ola {{cliente_nome}}, sua assinatura Facilita MEI ja esta pronta. Para concluir, assine o contrato enviado.'
)
ON DUPLICATE KEY UPDATE
  ativo = VALUES(ativo),
  dias_primeiro_lembrete = VALUES(dias_primeiro_lembrete),
  intervalo_dias = VALUES(intervalo_dias),
  max_lembretes = VALUES(max_lembretes),
  canal_email = VALUES(canal_email),
  canal_whatsapp = VALUES(canal_whatsapp),
  mensagem_padrao = VALUES(mensagem_padrao);

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
