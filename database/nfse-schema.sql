-- Modulo NFS-e - estrutura complementar ao schema atual.
-- O projeto ja possui users, plans, subscriptions e payments.
-- Por isso, estes ALTERs adicionam apenas os campos faltantes equivalentes a
-- clientes, planos, assinaturas e pagamentos, sem quebrar o fluxo existente.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS cnpj VARCHAR(14) NULL AFTER documento,
  ADD COLUMN IF NOT EXISTS razao_social VARCHAR(180) NULL AFTER cnpj,
  ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(180) NULL AFTER razao_social,
  ADD COLUMN IF NOT EXISTS cep VARCHAR(12) NULL AFTER nome_fantasia,
  ADD COLUMN IF NOT EXISTS logradouro VARCHAR(180) NULL AFTER cep,
  ADD COLUMN IF NOT EXISTS numero VARCHAR(30) NULL AFTER logradouro,
  ADD COLUMN IF NOT EXISTS bairro VARCHAR(120) NULL AFTER numero,
  ADD COLUMN IF NOT EXISTS municipio VARCHAR(120) NULL AFTER bairro,
  ADD COLUMN IF NOT EXISTS codigo_municipio VARCHAR(7) NULL AFTER municipio,
  ADD COLUMN IF NOT EXISTS uf CHAR(2) NULL AFTER codigo_municipio,
  ADD COLUMN IF NOT EXISTS cnae_principal_codigo VARCHAR(20) NULL AFTER uf,
  ADD COLUMN IF NOT EXISTS cnae_principal_descricao VARCHAR(220) NULL AFTER cnae_principal_codigo;

-- Rode uma unica vez caso o indice ainda nao exista.
-- Se o MySQL reclamar que o indice ja existe, ignore essa linha.
ALTER TABLE users
  ADD UNIQUE KEY users_cnpj_unique (cnpj);

UPDATE users
SET whatsapp = telefone
WHERE whatsapp IS NULL AND telefone IS NOT NULL;

UPDATE users
SET cnpj = REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '')
WHERE cnpj IS NULL
  AND documento IS NOT NULL
  AND CHAR_LENGTH(REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '')) = 14;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS descricao_nfse TEXT NULL AFTER valor;

UPDATE plans
SET descricao_nfse = COALESCE(descricao_nfse, descricao)
WHERE descricao_nfse IS NULL;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(40) NULL AFTER plan_id,
  ADD COLUMN IF NOT EXISTS gateway_subscription_id VARCHAR(120) NULL AFTER gateway;

UPDATE subscriptions
SET gateway = COALESCE(gateway, 'mercado_pago'),
    gateway_subscription_id = COALESCE(gateway_subscription_id, mercado_pago_subscription_id)
WHERE gateway IS NULL OR gateway_subscription_id IS NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gateway VARCHAR(40) NULL AFTER subscription_id,
  ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(120) NULL AFTER gateway,
  ADD COLUMN IF NOT EXISTS competencia CHAR(7) NULL AFTER data_pagamento,
  ADD COLUMN IF NOT EXISTS nfse_emitida TINYINT(1) NOT NULL DEFAULT 0 AFTER competencia,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE payments
SET gateway = COALESCE(gateway, 'mercado_pago'),
    gateway_payment_id = COALESCE(gateway_payment_id, mercado_pago_payment_id),
    competencia = COALESCE(competencia, DATE_FORMAT(COALESCE(data_pagamento, created_at), '%Y-%m'))
WHERE gateway IS NULL OR gateway_payment_id IS NULL OR competencia IS NULL;

-- Rode uma unica vez caso o indice ainda nao exista.
-- Se o MySQL reclamar que o indice ja existe, ignore essa linha.
ALTER TABLE payments
  ADD UNIQUE KEY payments_gateway_payment_id_unique (gateway_payment_id);

CREATE TABLE IF NOT EXISTS configuracoes_nfse (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_nome VARCHAR(180) NOT NULL,
  empresa_cnpj VARCHAR(14) NOT NULL,
  empresa_email VARCHAR(160) NOT NULL,
  empresa_telefone VARCHAR(30) NOT NULL,
  codigo_municipio VARCHAR(7) NOT NULL,
  municipio VARCHAR(120) NOT NULL,
  uf CHAR(2) NOT NULL,
  serie_dps VARCHAR(10) NOT NULL,
  proximo_numero_dps BIGINT UNSIGNED NOT NULL,
  c_trib_nac VARCHAR(20) NOT NULL,
  c_nbs VARCHAR(20) NOT NULL,
  c_int_contrib VARCHAR(30) NOT NULL,
  descricao_servico_padrao TEXT NOT NULL,
  op_simp_nac VARCHAR(5) NOT NULL,
  reg_ap_trib_sn VARCHAR(5) NOT NULL,
  reg_esp_trib VARCHAR(5) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO configuracoes_nfse
  (
    id,
    empresa_nome,
    empresa_cnpj,
    empresa_email,
    empresa_telefone,
    codigo_municipio,
    municipio,
    uf,
    serie_dps,
    proximo_numero_dps,
    c_trib_nac,
    c_nbs,
    c_int_contrib,
    descricao_servico_padrao,
    op_simp_nac,
    reg_ap_trib_sn,
    reg_esp_trib
  )
VALUES
  (
    1,
    'FACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA',
    '41952830000104',
    'vilmombatista@gmail.com',
    '67992230801',
    '5002407',
    'Caarapo',
    'MS',
    '1',
    357,
    '171901',
    '113022100',
    '1480',
    'SERVICOS PRESTADOS DE CONSULTORIA E ASSESSORIA CONTABIL',
    '3',
    '1',
    '0'
  )
ON DUPLICATE KEY UPDATE
  empresa_nome = VALUES(empresa_nome),
  empresa_cnpj = VALUES(empresa_cnpj),
  empresa_email = VALUES(empresa_email),
  empresa_telefone = VALUES(empresa_telefone),
  codigo_municipio = VALUES(codigo_municipio),
  municipio = VALUES(municipio),
  uf = VALUES(uf),
  serie_dps = VALUES(serie_dps),
  c_trib_nac = VALUES(c_trib_nac),
  c_nbs = VALUES(c_nbs),
  c_int_contrib = VALUES(c_int_contrib),
  descricao_servico_padrao = VALUES(descricao_servico_padrao),
  op_simp_nac = VALUES(op_simp_nac),
  reg_ap_trib_sn = VALUES(reg_ap_trib_sn),
  reg_esp_trib = VALUES(reg_esp_trib);

INSERT INTO plans
  (id, nome, valor, descricao, descricao_nfse, frequencia, tipo_frequencia, servico, tipo_cobranca, ativo, ordem)
VALUES
  (
    'contabilidade_basico',
    'Plano Contabilidade Basico',
    488.85,
    'Plano Contabilidade Basico',
    'Nota fiscal da assinatura do Plano Contabilidade Basico. Servicos prestados de consultoria e assessoria contabil.',
    1,
    'months',
    'contabilidade_basico',
    'subscription',
    1,
    60
  )
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome),
  valor = VALUES(valor),
  descricao_nfse = VALUES(descricao_nfse),
  ativo = VALUES(ativo),
  updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS nfse_emissoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id BIGINT UNSIGNED NOT NULL,
  assinatura_id BIGINT UNSIGNED NULL,
  pagamento_id BIGINT UNSIGNED NULL,
  numero_dps BIGINT UNSIGNED NOT NULL,
  serie_dps VARCHAR(10) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  competencia CHAR(7) NOT NULL,
  descricao_servico TEXT NOT NULL,
  status ENUM('pendente', 'gerando_xml', 'dps_gerada', 'mock_gerado', 'assinado', 'enviado', 'emitida', 'autorizado', 'rejeitado', 'cancelado', 'erro') NOT NULL DEFAULT 'pendente',
  xml_dps LONGTEXT NULL,
  xml_dps_assinado LONGTEXT NULL,
  xml_nfse LONGTEXT NULL,
  pdf_url TEXT NULL,
  numero_nfse VARCHAR(80) NULL,
  chave_acesso VARCHAR(120) NULL,
  codigo_verificacao VARCHAR(120) NULL,
  erro_mensagem TEXT NULL,
  enviada_email TINYINT(1) NOT NULL DEFAULT 0,
  enviada_whatsapp TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY nfse_emissoes_pagamento_unique (pagamento_id),
  UNIQUE KEY nfse_emissoes_assinatura_competencia_unique (assinatura_id, competencia),
  UNIQUE KEY nfse_emissoes_dps_unique (serie_dps, numero_dps),
  KEY nfse_emissoes_cliente_idx (cliente_id),
  KEY nfse_emissoes_status_idx (status),
  KEY nfse_emissoes_competencia_idx (competencia),
  CONSTRAINT nfse_emissoes_cliente_fk FOREIGN KEY (cliente_id) REFERENCES users(id),
  CONSTRAINT nfse_emissoes_assinatura_fk FOREIGN KEY (assinatura_id) REFERENCES subscriptions(id),
  CONSTRAINT nfse_emissoes_pagamento_fk FOREIGN KEY (pagamento_id) REFERENCES payments(id)
);

ALTER TABLE nfse_emissoes
  MODIFY COLUMN status ENUM('pendente', 'gerando_xml', 'dps_gerada', 'mock_gerado', 'assinado', 'enviado', 'emitida', 'autorizado', 'rejeitado', 'cancelado', 'erro') NOT NULL DEFAULT 'pendente';

-- Views opcionais de leitura com os nomes solicitados pelo modulo.
CREATE OR REPLACE VIEW clientes AS
SELECT
  id,
  nome,
  email,
  COALESCE(whatsapp, telefone) AS whatsapp,
  cnpj,
  razao_social,
  nome_fantasia,
  cep,
  logradouro,
  numero,
  bairro,
  municipio,
  codigo_municipio,
  uf,
  cnae_principal_codigo,
  cnae_principal_descricao,
  created_at,
  updated_at
FROM users;

CREATE OR REPLACE VIEW planos AS
SELECT
  id,
  nome,
  valor,
  descricao_nfse,
  ativo,
  created_at,
  updated_at
FROM plans;

CREATE OR REPLACE VIEW assinaturas AS
SELECT
  id,
  user_id AS cliente_id,
  plan_id AS plano_id,
  gateway,
  gateway_subscription_id,
  status,
  created_at,
  updated_at
FROM subscriptions;

CREATE OR REPLACE VIEW pagamentos AS
SELECT
  id,
  subscription_id AS assinatura_id,
  gateway,
  gateway_payment_id,
  valor,
  status,
  data_pagamento,
  competencia,
  nfse_emitida,
  created_at,
  updated_at
FROM payments;
