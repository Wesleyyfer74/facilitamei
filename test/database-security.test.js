import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decryptSensitive, encryptSensitive } from "../src/services/dataEncryptionService.js";
import { migrationChecksum, runSqlMigration, splitSqlStatements } from "../src/services/migrationService.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("AES-256-GCM protege dados e detecta adulteracao", () => {
  const key = crypto.randomBytes(32).toString("base64");
  const encrypted = encryptSensitive("agencia-1234", key);
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(decryptSensitive(encrypted, key), "agencia-1234");
  const tampered = `${encrypted.slice(0, -2)}AA`;
  assert.throws(() => decryptSensitive(tampered, key));
});

test("criptografia usa IV aleatorio e aceita legado somente para leitura", () => {
  const key = crypto.randomBytes(32).toString("base64");
  assert.notEqual(encryptSensitive("mesmo", key), encryptSensitive("mesmo", key));
  assert.equal(decryptSensitive("valor-legado", key), "valor-legado");
});

test("migracoes possuem separacao deterministica e checksum", () => {
  const sql = "CREATE TABLE exemplo (id INT);\nALTER TABLE exemplo ADD nome TEXT;";
  assert.equal(splitSqlStatements(sql).length, 2);
  assert.equal(migrationChecksum(sql), migrationChecksum(sql));
  assert.notEqual(migrationChecksum(sql), migrationChecksum(`${sql}\n-- alterado`));
});

test("migracao pode retomar DDL parcialmente aplicado", async () => {
  const executed = [];
  const connection = {
    async execute(sql) {
      if (sql.startsWith("SELECT checksum")) return [[]];
      executed.push(sql);
      return [{}];
    },
    async query(sql) {
      if (sql.includes("indice_existente")) throw Object.assign(new Error("indice duplicado"), { code: "ER_DUP_KEYNAME" });
      executed.push(sql);
    },
  };
  const applied = await runSqlMigration(connection, {
    version: "999", name: "retomavel.sql",
    sql: "CREATE INDEX indice_existente ON exemplo (id);\nALTER TABLE exemplo ADD nome TEXT;",
  });
  assert.equal(applied, true);
  assert.ok(executed.some((sql) => sql.includes("ADD nome")));
  assert.ok(executed.some((sql) => sql.startsWith("INSERT INTO schema_migrations")));
});

test("payload completo do gateway nao e mais persistido", async () => {
  const serverSource = await fs.readFile(path.resolve(import.meta.dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(serverSource, /JSON\.stringify\((?:paymentData|subscriptionData)\)/);
  assert.match(serverSource, /serializeMinimalGatewayPayload/);
});

test("pagamentos guardam vinculo direto com plano e forma de pagamento", async () => {
  const server = await fs.readFile(path.join(projectRoot, "server.js"), "utf8");
  const migration = await fs.readFile(
    path.join(projectRoot, "database", "migrations", "006-payment-plan-link.sql"),
    "utf8",
  );
  assert.match(server, /plan_id, payment_method/);
  assert.match(server, /LEFT JOIN plans pl ON pl\.id = p\.plan_id/);
  assert.match(migration, /ADD COLUMN plan_id/);
  assert.match(migration, /JSON_EXTRACT\(p\.raw_payload, '\$\.plan_id'\)/);
});

test("banco legado recebe colunas obrigatorias de pagamentos e documentos", async () => {
  const migration = await fs.readFile(
    path.join(projectRoot, "database", "migrations", "007-legacy-required-columns.sql"),
    "utf8",
  );
  for (const column of ["status_token_hash", "status_token_expires_at", "storage_key", "sha256"]) {
    assert.match(migration, new RegExp(`ADD COLUMN ${column}`));
  }
  assert.ok(splitSqlStatements(migration).length >= 9);
});
