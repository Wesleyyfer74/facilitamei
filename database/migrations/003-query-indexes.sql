CREATE INDEX payments_user_created_idx ON payments (user_id, created_at);
CREATE INDEX subscriptions_user_created_idx ON subscriptions (user_id, created_at);
CREATE INDEX customer_documents_user_created_idx ON customer_documents (user_id, created_at);
CREATE INDEX customer_contracts_user_created_idx ON customer_contracts (user_id, created_at);
CREATE INDEX email_logs_status_created_idx ON email_logs (status, created_at);
CREATE INDEX webhook_events_status_updated_idx ON mercado_pago_webhook_events (status, updated_at);
