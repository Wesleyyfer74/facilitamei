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
