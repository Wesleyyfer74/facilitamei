import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { hashAdminPassword } from "../src/services/adminAuthService.js";
import { encryptSensitive } from "../src/services/dataEncryptionService.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
const mfaSecret = String(process.env.ADMIN_BOOTSTRAP_MFA_SECRET || "").replace(/\s/g, "").toUpperCase();
if (!email.includes("@") || password.length < 12 || !/^[A-Z2-7]{16,}$/.test(mfaSecret)) {
  throw new Error("Configure e-mail, senha com 12 caracteres e segredo MFA Base32 com ao menos 16 caracteres.");
}
const { hash, salt } = hashAdminPassword(password);
const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
try {
  await connection.execute(
    `INSERT INTO admin_users (email, password_hash, password_salt, role, mfa_secret, mfa_enabled, active)
     VALUES (?, ?, ?, 'owner', ?, 1, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), password_salt = VALUES(password_salt),
       role = 'owner', mfa_secret = VALUES(mfa_secret), mfa_enabled = 1, active = 1`,
    [email, hash, salt, encryptSensitive(mfaSecret)],
  );
  console.log("Administrador owner criado/atualizado. Remova imediatamente as variaveis de bootstrap.");
} finally { await connection.end(); }
