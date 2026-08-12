import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decryptSensitive, encryptSensitive } from "../src/services/dataEncryptionService.js";
import { migrationChecksum, splitSqlStatements } from "../src/services/migrationService.js";

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

test("payload completo do gateway nao e mais persistido", async () => {
  const serverSource = await fs.readFile(path.resolve(import.meta.dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(serverSource, /JSON\.stringify\((?:paymentData|subscriptionData)\)/);
  assert.match(serverSource, /serializeMinimalGatewayPayload/);
});
