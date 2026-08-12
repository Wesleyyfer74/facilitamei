import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
const retentionDays = Math.max(Number(process.env.OPERATIONAL_DATA_RETENTION_DAYS || 365), 30);
const rawPayloadDays = Math.max(Number(process.env.PAYMENT_PAYLOAD_RETENTION_DAYS || 90), 30);
const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

try {
  await connection.beginTransaction();
  await connection.execute("DELETE FROM client_auth_tokens WHERE expires_at < NOW() - INTERVAL ? DAY", [retentionDays]);
  await connection.execute("DELETE FROM mercado_pago_webhook_events WHERE updated_at < NOW() - INTERVAL ? DAY", [retentionDays]);
  await connection.execute("DELETE FROM email_logs WHERE created_at < NOW() - INTERVAL ? DAY", [retentionDays]);
  await connection.execute("UPDATE payments SET raw_payload = NULL WHERE created_at < NOW() - INTERVAL ? DAY", [rawPayloadDays]);
  await connection.execute("UPDATE subscriptions SET raw_payload = NULL WHERE created_at < NOW() - INTERVAL ? DAY", [rawPayloadDays]);
  await connection.commit();
  console.log("Politica de retencao aplicada.");
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
