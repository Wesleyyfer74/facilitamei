import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateProductionConfig } from "../src/services/productionConfigService.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("configuracao do navegador usa a API publica do Railway", async () => {
  const config = await fs.readFile(path.join(projectRoot, "config.js"), "utf8");
  assert.match(config, /https:\/\/facilitamei-production\.up\.railway\.app/);
});

test("desenvolvimento nao exige segredos de producao", () => {
  assert.deepEqual(validateProductionConfig({ NODE_ENV: "test" }), []);
});

test("producao recusa configuracao incompleta e URL sem HTTPS", () => {
  const errors = validateProductionConfig({ NODE_ENV: "production", SITE_URL: "http://example.com" });
  assert.ok(errors.includes("REDIS_URL ausente"));
  assert.ok(!errors.includes("CLAMAV_HOST ausente"));
  assert.ok(errors.includes("SITE_URL deve usar HTTPS"));
  assert.ok(errors.includes("DOCUMENT_STORAGE_DRIVER deve ser s3") === false);
});

test("producao aceita configuracao completa", () => {
  const env = {
    NODE_ENV: "production",
    SITE_URL: "https://facilitameibr.com.br",
    API_PUBLIC_URL: "https://facilitamei-production.up.railway.app",
    DB_HOST: "db", DB_USER: "user", DB_PASSWORD: "secret", DB_NAME: "facilita", REDIS_URL: "redis://redis",
    MERCADO_PAGO_ACCESS_TOKEN: "token", MERCADO_PAGO_PUBLIC_KEY: "key", MERCADO_PAGO_WEBHOOK_SECRET: "1234567890123456",
    ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "senha-com-mais-de-12", ADMIN_API_KEY: "admin-key",
    EMAIL_HOST: "smtp.example.com", EMAIL_USER: "smtp", EMAIL_PASS: "secret",
    SERPRO_TOKEN_URL: "https://serpro.example/token", SERPRO_CONSUMER_KEY: "key", SERPRO_CONSUMER_SECRET: "secret",
    DOCUMENT_STORAGE_DRIVER: "s3", S3_DOCUMENTS_BUCKET: "private", S3_DOCUMENTS_REGION: "us-east-1", CLAMAV_HOST: "clamav",
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  };
  assert.deepEqual(validateProductionConfig(env), []);
});
