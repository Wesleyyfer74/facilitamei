ALTER TABLE payments
  ADD COLUMN plan_id VARCHAR(60) NULL AFTER subscription_id,
  ADD COLUMN payment_method VARCHAR(40) NULL AFTER plan_id,
  ADD KEY payments_plan_idx (plan_id),
  ADD CONSTRAINT payments_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;

UPDATE payments p
LEFT JOIN subscriptions s ON s.id = p.subscription_id
SET p.plan_id = COALESCE(
  s.plan_id,
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.raw_payload, '$.plan_id')), 'null')
)
WHERE p.plan_id IS NULL;

UPDATE payments
SET payment_method = CASE
  WHEN JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.payment_method_id')) = 'bolbradesco' THEN 'boleto'
  ELSE NULLIF(JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.payment_method_id')), 'null')
END
WHERE payment_method IS NULL;
