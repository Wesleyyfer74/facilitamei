import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import { createClient } from "redis";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { scanDocumentBuffer } from "../src/services/antivirusService.js";
import { validateHomologationConfig, validateHomologationFiles } from "../src/services/homologationService.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
const external = process.argv.includes("--external");
const results = [];

function record(name, ok, detail) { results.push({ name, ok, detail }); }

const missingFiles = await validateHomologationFiles(projectRoot);
record("arquivos", missingFiles.length === 0, missingFiles.length ? `ausentes: ${missingFiles.join(", ")}` : "ok");
const configErrors = validateHomologationConfig(process.env);
record("configuracao", configErrors.length === 0, configErrors.length ? configErrors.join("; ") : "ok");

if (external && configErrors.length === 0) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 1,
  });
  try { await pool.query("SELECT 1"); record("mysql", true, "ok"); }
  catch (error) { record("mysql", false, error.message); }
  finally { await pool.end(); }

  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on("error", () => {});
  try { await redis.connect(); await redis.ping(); record("redis", true, "ok"); }
  catch (error) { record("redis", false, error.message); }
  finally { if (redis.isOpen) await redis.quit(); }

  const s3 = new S3Client({
    region: process.env.S3_DOCUMENTS_REGION,
    endpoint: process.env.S3_DOCUMENTS_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_DOCUMENTS_ENDPOINT),
    credentials: process.env.S3_DOCUMENTS_ACCESS_KEY_ID ? {
      accessKeyId: process.env.S3_DOCUMENTS_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_DOCUMENTS_SECRET_ACCESS_KEY,
    } : undefined,
  });
  try { await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_DOCUMENTS_BUCKET })); record("s3", true, "bucket acessivel"); }
  catch (error) { record("s3", false, error.message); }
  finally { s3.destroy(); }

  try { await scanDocumentBuffer(Buffer.from("preflight seguro"), { required: true }); record("clamav", true, "ok"); }
  catch (error) { record("clamav", false, error.message); }

  const smtp = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: Number(process.env.EMAIL_PORT || 587),
    secure: String(process.env.EMAIL_SECURE).toLowerCase() === "true",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  try { await smtp.verify(); record("smtp", true, "autenticacao aceita; nenhum e-mail enviado"); }
  catch (error) { record("smtp", false, error.message); }

  const healthUrl = `${String(process.env.SITE_URL).replace(/\/$/, "")}/health/ready`;
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
    record("health-ready", response.ok, `HTTP ${response.status}`);
  } catch (error) { record("health-ready", false, error.message); }
}

for (const result of results) console.log(`${result.ok ? "OK" : "FALHA"} ${result.name}: ${result.detail}`);
if (results.some((result) => !result.ok)) process.exitCode = 1;
