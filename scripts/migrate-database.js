import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { migrationChecksum, runSqlMigration, splitSqlStatements } from "../src/services/migrationService.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

let locked = false;
try {
  const [lockRows] = await connection.query("SELECT GET_LOCK('facilitamei_schema_migrations', 30) AS acquired");
  if (Number(lockRows[0]?.acquired) !== 1) throw new Error("Nao foi possivel obter trava exclusiva de migracao.");
  locked = true;
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(40) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const baselineSql = await fs.readFile(path.join(projectRoot, "database", "railway-schema.sql"), "utf8");
  // Reexecutar o baseline e seguro porque usa CREATE TABLE IF NOT EXISTS e
  // INSERT ... ON DUPLICATE KEY. Isso repara bancos legados incompletos antes
  // de as migracoes incrementais criarem indices ou alterarem colunas.
  for (const statement of splitSqlStatements(baselineSql)) await connection.query(statement);

  const [baselineRows] = await connection.execute("SELECT version FROM schema_migrations WHERE version = '001' LIMIT 1");
  if (!baselineRows[0]) {
    await connection.execute(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES ('001', 'baseline', ?)",
      [migrationChecksum(baselineSql)],
    );
    console.log("Migracao 001 registrada.");
  }

  const migrationsPath = path.join(projectRoot, "database", "migrations");
  const files = (await fs.readdir(migrationsPath)).filter((file) => /^\d{3}-.+\.sql$/.test(file)).sort();
  for (const file of files) {
    const version = file.slice(0, 3);
    const sql = await fs.readFile(path.join(migrationsPath, file), "utf8");
    if (await runSqlMigration(connection, { version, name: file, sql })) console.log(`Migracao ${file} aplicada.`);
  }
} finally {
  if (locked) await connection.query("SELECT RELEASE_LOCK('facilitamei_schema_migrations')").catch(() => {});
  await connection.end();
}
