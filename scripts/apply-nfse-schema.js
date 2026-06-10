import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../database/nfse-schema.sql");

function getDbConfig() {
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "facilita_modern",
    multipleStatements: true,
  };
}

async function main() {
  const config = getDbConfig();
  const sql = await fs.readFile(schemaPath, "utf8");

  console.log("Aplicando schema NFS-e no banco:", {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  });

  const connection = await mysql.createConnection(config);

  try {
    await connection.query(sql);
    console.log("Schema NFS-e aplicado com sucesso.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Erro ao aplicar schema NFS-e:", {
    code: error.code,
    errno: error.errno,
    sqlMessage: error.sqlMessage,
    message: error.message,
  });
  process.exit(1);
});
