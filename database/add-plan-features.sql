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
