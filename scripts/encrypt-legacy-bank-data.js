import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { encryptSensitive } from "../src/services/dataEncryptionService.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, namedPlaceholders: true, connectionLimit: 2,
});

let encrypted = 0;
try {
  while (true) {
    const [rows] = await pool.execute(
      `SELECT id, banco, agencia, conta, tipo_conta FROM users
       WHERE (banco IS NOT NULL AND banco NOT LIKE 'enc:v1:%')
          OR (agencia IS NOT NULL AND agencia NOT LIKE 'enc:v1:%')
          OR (conta IS NOT NULL AND conta NOT LIKE 'enc:v1:%')
          OR (tipo_conta IS NOT NULL AND tipo_conta NOT LIKE 'enc:v1:%')
       ORDER BY id LIMIT 100`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      await pool.execute(
        `UPDATE users SET banco = :banco, agencia = :agencia, conta = :conta, tipo_conta = :tipoConta
         WHERE id = :id`,
        {
          id: row.id,
          banco: encryptSensitive(row.banco), agencia: encryptSensitive(row.agencia),
          conta: encryptSensitive(row.conta), tipoConta: encryptSensitive(row.tipo_conta),
        },
      );
      encrypted += 1;
    }
  }
  console.log(`Criptografia concluida: ${encrypted} cliente(s).`);
} finally {
  await pool.end();
}
