import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const requiredSchema = {
  schema_migrations: ["version", "checksum", "applied_at"],
  admin_users: ["id", "email", "password_hash", "role", "mfa_secret", "mfa_enabled", "active"],
  admin_audit_logs: ["admin_user_id", "request_id", "action", "resource", "status_code"],
  users: ["id", "email", "senha_hash", "senha_salt", "cnpj"],
  client_auth_tokens: ["token_hash", "purpose", "expires_at", "used_at"],
  plans: ["id", "valor", "tipo_cobranca"],
  subscriptions: ["id", "user_id", "status"],
  payments: ["id", "gateway_payment_id", "plan_id", "payment_method", "status_token_hash", "status_token_expires_at"],
  mercado_pago_webhook_events: ["event_key", "status", "processed_at"],
  mercado_pago_webhook_receipts: ["receipt_id", "topic", "resource_id", "signature_present", "status", "http_status"],
  customer_documents: ["id", "user_id", "arquivo_url"],
  customer_document_files: ["document_id", "storage_key", "sha256"],
  customer_contracts: ["id", "user_id", "status"],
  contract_templates: ["id", "conteudo"],
  contract_reminder_settings: ["id", "ativo"],
  whatsapp_settings: ["id"],
  boleto_whatsapp_deliveries: ["id", "gateway_payment_id", "recipient", "status", "provider_message_id"],
  payment_reminder_deliveries: ["id", "user_id", "recipient", "status", "provider_message_id"],
  email_settings: ["id"],
  email_logs: ["dedupe_key", "status"],
  customer_contract_events: ["id", "acao"],
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  namedPlaceholders: true,
  connectionLimit: 1,
});

try {
  const [rows] = await pool.execute(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = :databaseName`,
    { databaseName: process.env.DB_NAME },
  );
  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.TABLE_NAME)) actual.set(row.TABLE_NAME, new Set());
    actual.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  const missing = [];
  for (const [table, columns] of Object.entries(requiredSchema)) {
    if (!actual.has(table)) missing.push(`tabela ${table}`);
    else for (const column of columns) if (!actual.get(table).has(column)) missing.push(`${table}.${column}`);
  }
  if (missing.length) throw new Error(`Schema incompleto: ${missing.join(", ")}`);
  console.log("Schema de producao verificado com sucesso.");
} finally {
  await pool.end();
}
