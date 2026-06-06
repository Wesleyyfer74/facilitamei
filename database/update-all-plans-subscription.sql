USE facilita_modern;

UPDATE plans
SET tipo_cobranca = 'subscription',
    tipo_frequencia = 'months',
    frequencia = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN ('start-mei', 'servicos', 'premium', 'comercio', 'full');
