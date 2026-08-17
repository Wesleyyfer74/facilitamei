INSERT INTO plans
  (id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca, ativo, ordem)
VALUES
  ('teste-pagamento-5', 'Teste de Pagamento', 'Plano temporario para validar pagamentos reais e o processamento do webhook.', 5.00, 1, 'months', 'payment_test', NULL, 'single', 1, 999)
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
