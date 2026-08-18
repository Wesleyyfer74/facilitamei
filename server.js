import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import multer from "multer";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { DAS_MEI_FACILITA_CNPJ, gerarDasMei, montarPayloadGerarDasMei } from "./src/services/dasMeiService.js";
import { gerarTokenSerpro } from "./src/services/serproAuthService.js";
import { createSessionStore } from "./src/services/sessionStore.js";
import {
  createClientAuthToken,
  hashClientAuthToken,
  normalizeClientAuthPurpose,
} from "./src/services/clientAuthTokenService.js";
import { createRateLimiter, createRateLimitStore } from "./src/services/rateLimitService.js";
import { createPaymentStatusToken, hashPaymentStatusToken } from "./src/services/paymentStatusTokenService.js";
import { validateUploadedDocument } from "./src/services/documentFileService.js";
import { createDocumentStorage, documentSha256 } from "./src/services/documentStorageService.js";
import { scanDocumentBuffer } from "./src/services/antivirusService.js";
import { assertProductionConfig, isProductionEnvironment } from "./src/services/productionConfigService.js";
import { decryptBankFields, encryptSensitive } from "./src/services/dataEncryptionService.js";
import { isAdminAuthorized } from "./src/services/adminAuthService.js";
import { hashIp, requestContextMiddleware } from "./src/services/structuredLogger.js";
import { sendOperationalAlert } from "./src/services/alertService.js";
import { metricsMiddleware, snapshotMetrics } from "./src/services/metricsService.js";
import { isWhatsappCloudConfigured, sendBoletoWhatsappTemplate } from "./src/services/whatsappCloudService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = Number(process.env.PORT || 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});
const localUrl = `http://localhost:${port}`;
const railwayPublicUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
const frontendUrl = process.env.FRONTEND_URL || process.env.SITE_URL || localUrl;
const apiPublicUrl = process.env.API_PUBLIC_URL || railwayPublicUrl || frontendUrl;
const mercadoPagoWebhookUrl = new URL("/api/webhooks/mercadopago", `${apiPublicUrl.replace(/\/$/, "")}/`).toString();
const mercadoPagoBackUrl = process.env.MERCADO_PAGO_BACK_URL || frontendUrl;
const isProduction = isProductionEnvironment();
if (isProduction && process.env.NODE_ENV !== "production") process.env.NODE_ENV = "production";
const paymentStore = new Map();
const adminSessionDurationMs = 1000 * 60 * 60 * 8;
const clientSessionDurationMs = 1000 * 60 * 60 * 24 * 7;
const sessionStore = createSessionStore();
const rateLimitStore = createRateLimitStore();
const documentStorage = createDocumentStorage({ rootPath: path.join(__dirname, "data", "private-documents") });
const requestIp = (request) => request.ip || request.socket?.remoteAddress || "unknown";
const accountIdentity = (request) => `${requestIp(request)}:${cleanEmail(request.body?.email || "anonymous")}`;
const sessionIdentity = (request) => `${requestIp(request)}:${request.clientSession?.userId || "anonymous"}`;
const generalApiLimiter = createRateLimiter({
  store: rateLimitStore,
  name: "api-general",
  limit: 120,
  windowMs: 60 * 1000,
  keyGenerator: requestIp,
  skip: (request) => request.path === "/webhooks/mercadopago",
});
const adminLoginLimiter = createRateLimiter({ store: rateLimitStore, name: "admin-login", limit: 5, windowMs: 15 * 60 * 1000, keyGenerator: accountIdentity });
const clientAuthLimiter = createRateLimiter({ store: rateLimitStore, name: "client-auth", limit: 5, windowMs: 15 * 60 * 1000, keyGenerator: accountIdentity });
const cnpjLookupLimiter = createRateLimiter({ store: rateLimitStore, name: "cnpj-lookup", limit: 10, windowMs: 60 * 1000, keyGenerator: requestIp });
const paymentCreationLimiter = createRateLimiter({ store: rateLimitStore, name: "payment-create", limit: 5, windowMs: 10 * 60 * 1000, keyGenerator: accountIdentity });
const paymentStatusLimiter = createRateLimiter({ store: rateLimitStore, name: "payment-status", limit: 30, windowMs: 60 * 1000, keyGenerator: requestIp });
const dasLimiter = createRateLimiter({ store: rateLimitStore, name: "client-das", limit: 3, windowMs: 60 * 60 * 1000, keyGenerator: sessionIdentity });
const companyLimiter = createRateLimiter({ store: rateLimitStore, name: "client-company", limit: 10, windowMs: 60 * 60 * 1000, keyGenerator: sessionIdentity });
const webhookLimiter = createRateLimiter({ store: rateLimitStore, name: "mp-webhook", limit: 600, windowMs: 60 * 1000, keyGenerator: requestIp });
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "facilita_modern",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});
function originVariants(value) {
  try {
    const url = new URL(value);
    const origins = [url.origin];
    if (url.protocol === "https:" && !url.hostname.endsWith(".up.railway.app")) {
      url.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
      origins.push(url.origin);
    }
    return origins;
  } catch {
    return [];
  }
}

const configuredCorsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...originVariants(frontendUrl),
  ...originVariants(apiPublicUrl),
  ...(!isProduction ? ["http://localhost", "http://127.0.0.1", "http://localhost:80", "http://127.0.0.1:80", "http://localhost:3000", "http://127.0.0.1:3000"] : []),
  ...configuredCorsOrigins.flatMap(originVariants),
]);

app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(requestContextMiddleware);
app.use(metricsMiddleware);
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self' https://sdk.mercadopago.com https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      `connect-src 'self' ${[...allowedOrigins].join(" ")} https://api.mercadopago.com https://api.mercadolibre.com https://*.mercadopago.com https://*.mercadolibre.com`,
      "frame-src https://*.mercadopago.com https://*.mercadolibre.com",
      "form-action 'self'",
    ].join("; "),
  );
  if (isProduction) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(Object.assign(new Error("Origem nao autorizada pelo CORS."), { status: 403 }));
    },
  }),
);
app.get("/health/live", (_request, response) => response.json({ status: "ok" }));
app.get("/health/ready", async (_request, response) => {
  try {
    await Promise.all([dbPool.query("SELECT 1"), sessionStore.ping(), rateLimitStore.ping()]);
    response.json({ status: "ready", mysql: "ok", redis: "ok" });
  } catch (error) {
    console.error("Readiness check falhou:", error.message);
    void sendOperationalAlert("readiness_failed", { message: error.message });
    response.status(503).json({ status: "not_ready" });
  }
});
app.use(express.json());
app.use("/api", generalApiLimiter);
app.use((error, _request, response, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "JSON invalido no corpo da requisicao." });
  }

  return next(error);
});
app.use((request, response, next) => {
  const blockedPattern =
    /^\/(?:\.env|package(?:-lock)?\.json|server\.js|backend\.log|DEPLOYMENT\.md)$/i;
  const blockedDirectory = /^\/(?:data|database|docs|scripts|node_modules|\.git|\.agents|\.codex)(?:\/|$)/i;

  if (blockedPattern.test(request.path) || blockedDirectory.test(request.path)) {
    return response.sendStatus(404);
  }

  return next();
});
app.use(
  "/assets",
  express.static(path.join(__dirname, "assets"), {
    dotfiles: "deny",
    index: false,
    maxAge: isProduction ? "30d" : 0,
  }),
);
app.use(
  "/admin",
  express.static(path.join(__dirname, "admin"), {
    dotfiles: "deny",
    index: "index.html",
    maxAge: isProduction ? "30d" : 0,
    setHeaders(response, filePath) { if (filePath.endsWith(".html")) response.setHeader("Cache-Control", "no-cache"); },
  }),
);
app.use(
  "/cliente",
  express.static(path.join(__dirname, "cliente"), {
    dotfiles: "deny",
    index: "index.html",
    maxAge: isProduction ? "30d" : 0,
    setHeaders(response, filePath) { if (filePath.endsWith(".html")) response.setHeader("Cache-Control", "no-cache"); },
  }),
);
app.get("/config.js", (_request, response) => {
  response.sendFile(path.join(__dirname, "config.js"));
});
app.get("/styles.css", (_request, response) => {
  response.sendFile(path.join(__dirname, "styles.css"));
});
app.get("/app.js", (_request, response) => {
  response.sendFile(path.join(__dirname, "app.js"));
});

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) return [cookie, ""];
        return [cookie.slice(0, separatorIndex), decodeURIComponent(cookie.slice(separatorIndex + 1))];
      }),
  );
}

async function createAdminSession(admin = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + adminSessionDurationMs;

  await sessionStore.set("admin", token, {
    csrfToken,
    adminUserId: admin.id || null,
    email: admin.email || null,
    role: admin.role || "owner",
  }, adminSessionDurationMs);
  return { token, csrfToken, expiresAt };
}

async function createClientSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + clientSessionDurationMs;

  await sessionStore.set("client", token, {
    userId: user.id,
    email: user.email,
    csrfToken,
  }, clientSessionDurationMs);
  return { token, csrfToken, expiresAt };
}

function setSessionCookie(response, name, token, expiresAt) {
  const cookieParts = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    isProduction ? "SameSite=None" : "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  if (isProduction) cookieParts.push("Secure");
  response.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearSessionCookie(response, name) {
  const cookieParts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    isProduction ? "SameSite=None" : "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (isProduction) cookieParts.push("Secure");
  response.setHeader("Set-Cookie", cookieParts.join("; "));
}

function setAdminCookie(response, token, expiresAt) {
  setSessionCookie(response, "facilita_admin", token, expiresAt);
}

function setClientCookie(response, token, expiresAt) {
  setSessionCookie(response, "facilita_client", token, expiresAt);
}

function clearAdminCookie(response) {
  clearSessionCookie(response, "facilita_admin");
}

function clearClientCookie(response) {
  clearSessionCookie(response, "facilita_client");
}

function safeCompare(value = "", expected = "") {
  const valueBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));

  if (valueBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function hashPassword(password = "") {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password = "", hash = "", salt = "") {
  if (!hash || !salt) return false;
  const attemptedHash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return safeCompare(attemptedHash, hash);
}

function getMercadoPagoClient() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
    throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
  }

  return new MercadoPagoConfig({ accessToken });
}

function normalizePlan(row) {
  return {
    id: row.id,
    title: row.nome,
    price: Number(row.valor),
    description: row.descricao,
    billing: row.tipo_cobranca,
    frequency: Number(row.frequencia || 1),
    frequencyType: row.tipo_frequencia || "months",
    serviceCode: row.servico,
    mercadoPagoPlanId: row.mercado_pago_plan_id,
  };
}

async function getPlanById(planId) {
  if (!planId) return null;

  const [rows] = await dbPool.execute(
    `SELECT id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca
     FROM plans
     WHERE id = :planId AND ativo = 1
     LIMIT 1`,
    { planId },
  );

  return rows[0] ? normalizePlan(rows[0]) : null;
}

async function saveMercadoPagoPlanId(planId, mercadoPagoPlanId) {
  await dbPool.execute(
    `UPDATE plans
     SET mercado_pago_plan_id = :mercadoPagoPlanId,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :planId`,
    { planId, mercadoPagoPlanId },
  );
}

async function getActiveSubscriptionPlans() {
  const [rows] = await dbPool.execute(
    `SELECT id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca
     FROM plans
     WHERE ativo = 1 AND tipo_cobranca = 'subscription'
     ORDER BY ordem ASC, nome ASC`,
  );

  return rows.map(normalizePlan);
}

async function logContractEvent({ contractId = null, userId = null, acao, status = "registrado", destino = null, mensagem = null }) {
  try {
    await dbPool.execute(
      `INSERT INTO customer_contract_events
        (contract_id, user_id, acao, status, destino, mensagem)
       VALUES
        (:contractId, :userId, :acao, :status, :destino, :mensagem)`,
      { contractId, userId, acao, status, destino, mensagem },
    );
  } catch (error) {
    console.warn("Nao foi possivel registrar historico de contrato.", error.message);
  }
}

let paymentsMetadataColumnsPromise = null;

async function ensurePaymentsMetadataColumns() {
  if (paymentsMetadataColumnsPromise) return paymentsMetadataColumnsPromise;

  paymentsMetadataColumnsPromise = (async () => {
    const databaseName = process.env.DB_NAME || "facilita_modern";
    try {
      const [rows] = await dbPool.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :databaseName
           AND TABLE_NAME = 'payments'`,
        { databaseName },
      );
      const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME));
      const requiredColumns = ["gateway", "gateway_payment_id", "plan_id", "payment_method", "competencia", "updated_at", "status_token_hash", "status_token_expires_at"];
      const missingColumns = requiredColumns.filter((column) => !existingColumns.has(column));
      if (missingColumns.length) throw new Error(`Execute as migracoes: payments sem ${missingColumns.join(", ")}`);
    } catch (error) {
      paymentsMetadataColumnsPromise = null;
      throw error;
    }
  })();

  return paymentsMetadataColumnsPromise;
}

function cleanText(value = "", maxLength = 180) {
  return String(value || "").trim().slice(0, maxLength) || null;
}

function cleanEmail(value = "") {
  const email = String(value || "").trim().toLowerCase().slice(0, 180);
  return email || null;
}

function cleanUf(value = "") {
  const uf = String(value || "").replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2);
  return uf || null;
}

function cleanDecimal(value) {
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function cleanDate(value = "") {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getOpenCnpjAddress(data = {}) {
  const rawStreet = cleanText(data.logradouro, 180);
  const rawNumber = cleanText(data.numero, 30);
  const streetWithoutNumber = rawNumber
    ? rawStreet.replace(new RegExp(`,?\\s*${rawNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "").trim()
    : rawStreet;

  return {
    logradouro: streetWithoutNumber || rawStreet,
    numero: rawNumber,
  };
}

function normalizeOpenCnpjPayload(payload = {}, fallbackCnpj = "") {
  const data = payload.data || payload;
  const establishment = data.estabelecimento || {};
  const cnpj = normalizeDigits(data.cnpj || fallbackCnpj);
  const address = getOpenCnpjAddress(establishment.cnpj ? establishment : data);
  const phoneFromCnpjWs = `${establishment.ddd1 || ""}${establishment.telefone1 || ""}`;

  return {
    cnpj: cnpj || normalizeDigits(establishment.cnpj || ""),
    razaoSocial: cleanText(data.razaoSocial || data.razao_social, 180),
    nomeFantasia: cleanText(data.nomeFantasia || data.nome_fantasia || establishment.nome_fantasia, 160),
    situacaoCadastral: cleanText(data.situacaoCadastral || data.situacao_cadastral || establishment.situacao_cadastral, 80),
    dataAbertura: cleanDate(data.dataInicioAtividades || data.data_inicio_atividades || establishment.data_inicio_atividade),
    capitalSocial: Number.isFinite(Number(data.capitalSocial)) ? Number(data.capitalSocial) : cleanDecimal(data.capital_social),
    telefone: normalizeDigits(data.telefone || phoneFromCnpjWs).slice(0, 30) || null,
    logradouro: address.logradouro,
    numero: address.numero,
    complemento: cleanText(data.complemento || establishment.complemento, 120),
    bairro: cleanText(data.bairro || establishment.bairro, 120),
    municipio: cleanText(data.municipio || establishment.cidade?.nome, 120),
    uf: cleanUf(data.uf || establishment.estado?.sigla),
    cep: normalizeDigits(data.cep || establishment.cep || "").slice(0, 8) || null,
  };
}

async function consultarCnpjWs(cnpj) {
  const cleanCnpj = normalizeDigits(cnpj);
  const response = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`, {
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error("CNPJ.ws retornou uma resposta invalida.");
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(data.detalhes || data.titulo || "Nao foi possivel consultar este CNPJ.");
    error.status = response.status || 502;
    throw error;
  }

  return normalizeOpenCnpjPayload(data, cleanCnpj);
}

async function consultarOpenCnpj(cnpj) {
  const cleanCnpj = normalizeDigits(cnpj);

  if (cleanCnpj.length !== 14) {
    const error = new Error("Informe um CNPJ valido com 14 digitos.");
    error.status = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const openCnpjResponse = await fetch(`https://kitana.opencnpj.com/cnpj/${cleanCnpj}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await openCnpjResponse.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      const error = new Error("OpenCNPJ retornou uma resposta invalida.");
      error.status = 502;
      throw error;
    }

    if (openCnpjResponse.status === 404 || data.message === "Nao encontrada." || data.message === "Não encontrada.") {
      const fallback = await consultarCnpjWs(cleanCnpj);
      if (!fallback.razaoSocial) {
        const error = new Error("A consulta publica nao retornou razao social para este CNPJ.");
        error.status = 422;
        throw error;
      }
      return fallback;
    }

    if (!openCnpjResponse.ok || data.success === false) {
      const error = new Error(data.message || "Nao foi possivel consultar este CNPJ no OpenCNPJ.");
      error.status = openCnpjResponse.status || 502;
      throw error;
    }

    const normalized = normalizeOpenCnpjPayload(data, cleanCnpj);

    if (!normalized.razaoSocial) {
      const error = new Error("O OpenCNPJ nao retornou razao social para este CNPJ.");
      error.status = 422;
      throw error;
    }

    return normalized;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo esgotado ao consultar o OpenCNPJ.");
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function vincularCnpjAoCliente({ customerId, cnpj }) {
  const cleanCnpj = normalizeDigits(cnpj);

  if (!customerId || !isValidCnpj(cleanCnpj)) {
    const error = new Error("Informe um CNPJ valido.");
    error.status = 400;
    throw error;
  }

  const [rows] = await dbPool.execute(
    `SELECT u.id, u.cnpj, u.telefone, u.whatsapp
     FROM users u
     WHERE u.id = :customerId
       AND u.cliente_login_ativo = 1
       AND u.status NOT IN ('blocked', 'cancelled')
     LIMIT 1`,
    { customerId },
  );

  const user = rows[0];
  if (!user) {
    const error = new Error("Cliente nao autorizado para alterar os dados empresariais.");
    error.status = 404;
    throw error;
  }
  const currentCnpj = normalizeDigits(user.cnpj || "");
  if (currentCnpj && currentCnpj !== cleanCnpj) {
    const error = new Error("A troca de um CNPJ ja cadastrado exige confirmacao da equipe de atendimento.");
    error.status = 409;
    throw error;
  }

  const cnpjData = await consultarOpenCnpj(cleanCnpj);
  const telefone = cnpjData.telefone || user.whatsapp || user.telefone || null;

  await dbPool.execute(
    `UPDATE users
     SET cnpj = :cnpj,
         razao_social = :razaoSocial,
         nome_fantasia = :nomeFantasia,
         data_abertura = :dataAbertura,
         cep = :cep,
         logradouro = :logradouro,
         numero = :numero,
         complemento = :complemento,
         bairro = :bairro,
         municipio = :municipio,
         uf = :uf,
         capital_social = :capitalSocial,
         telefone = :telefone,
         whatsapp = COALESCE(whatsapp, :telefone),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :customerId`,
    {
      customerId,
      cnpj: cnpjData.cnpj,
      razaoSocial: cnpjData.razaoSocial,
      nomeFantasia: cnpjData.nomeFantasia,
      dataAbertura: cnpjData.dataAbertura,
      cep: cnpjData.cep,
      logradouro: cnpjData.logradouro,
      numero: cnpjData.numero,
      complemento: cnpjData.complemento,
      bairro: cnpjData.bairro,
      municipio: cnpjData.municipio,
      uf: cnpjData.uf,
      capitalSocial: cnpjData.capitalSocial,
      telefone,
    },
  );

  return cnpjData;
}

function getAccessTokenOrThrow() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
    throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
  }

  return accessToken;
}

async function createMercadoPagoPlan(plan, accessToken = getAccessTokenOrThrow()) {
  const mercadoPagoResponse = await fetch("https://api.mercadopago.com/preapproval_plan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: plan.title,
      auto_recurring: {
        frequency: plan.frequency,
        frequency_type: plan.frequencyType,
        transaction_amount: plan.price,
        currency_id: "BRL",
      },
      back_url: `${mercadoPagoBackUrl}/?subscription_plan=${plan.id}`,
    }),
  });

  const data = await mercadoPagoResponse.json();

  if (!mercadoPagoResponse.ok) {
    const error = new Error(data.message || "Erro ao criar plano no Mercado Pago.");
    error.status = mercadoPagoResponse.status;
    error.details = data;
    throw error;
  }

  await saveMercadoPagoPlanId(plan.id, data.id);

  return data;
}

function requireAdminKey(request, response, next) {
  const adminKey = process.env.ADMIN_API_KEY || "";
  const providedKey = request.get("x-admin-key") || request.query.adminKey || "";

  if (!adminKey) {
    return response.status(403).json({ error: "ADMIN_API_KEY nao configurada no servidor." });
  }

  if (providedKey !== adminKey) {
    return response.status(401).json({ error: "Acesso administrativo nao autorizado." });
  }

  return next();
}

app.get("/api/admin/env-check", requireAdminKey, (_request, response) => {
  response.json({
    adminEmailConfigured: Boolean(process.env.ADMIN_EMAIL),
    adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD),
    adminPasswordLength: String(process.env.ADMIN_PASSWORD || "").length,
    adminApiKeyConfigured: Boolean(process.env.ADMIN_API_KEY),
    nodeEnv: process.env.NODE_ENV || "",
    railwayPublicDomainConfigured: Boolean(process.env.RAILWAY_PUBLIC_DOMAIN),
    apiPublicUrl,
    frontendUrl,
  });
});

app.get("/api/admin/metrics", requireAdminKey, (_request, response) => response.json(snapshotMetrics()));

async function requireAdminSession(request, response, next) {
  try {
  const token = parseCookies(request.get("cookie") || "").facilita_admin || "";
  const session = token ? await sessionStore.touch("admin", token, adminSessionDurationMs) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (token) await sessionStore.delete("admin", token);
    clearAdminCookie(response);
    return response.status(401).json({ error: "Sessao administrativa expirada. Faça login novamente." });
  }

  setAdminCookie(response, token, session.expiresAt);
  request.adminSession = session;
  if (session.adminUserId && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !response.locals.auditAttached) {
    response.locals.auditAttached = true;
    response.on("finish", () => {
      dbPool.execute(
        `INSERT INTO admin_audit_logs (admin_user_id, request_id, action, resource, status_code, ip_hash)
         VALUES (:adminUserId, :requestId, :action, :resource, :statusCode, :ipHash)`,
        {
          adminUserId: session.adminUserId || null,
          requestId: request.requestId,
          action: request.method,
          resource: String(request.originalUrl || request.path).split("?")[0].slice(0, 255),
          statusCode: response.statusCode,
          ipHash: hashIp(requestIp(request)),
        },
      ).catch((error) => sendOperationalAlert("admin_audit_failed", { requestId: request.requestId, message: error.message }));
    });
  }
  if (!isAdminAuthorized(session.role || "viewer", request.method, request.path)) {
    return response.status(403).json({ error: "Seu papel administrativo nao permite esta operacao." });
  }
  return next();
  } catch (error) {
    return next(error);
  }
}

async function requireClientSession(request, response, next) {
  try {
  const token = parseCookies(request.get("cookie") || "").facilita_client || "";
  const session = token ? await sessionStore.touch("client", token, clientSessionDurationMs) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (token) await sessionStore.delete("client", token);
    clearClientCookie(response);
    return response.status(401).json({ error: "Sessao do cliente expirada. Faca login novamente." });
  }

  setClientCookie(response, token, session.expiresAt);
  request.clientSession = session;
  return next();
  } catch (error) {
    return next(error);
  }
}

async function requireCsrfForAuthenticatedRoutes(request, response, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();

  const routeType = request.path.startsWith("/api/admin/")
    ? "admin"
    : request.path.startsWith("/api/client/")
      ? "client"
      : null;
  if (!routeType) return next();

  const publicAuthPaths = new Set([
    "/api/admin/auth/login",
    "/api/client/auth/login",
    "/api/client/auth/setup",
    "/api/client/auth/setup/request",
    "/api/client/auth/setup/confirm",
    "/api/client/auth/recovery/request",
    "/api/client/auth/recovery/confirm",
  ]);
  if (publicAuthPaths.has(request.path)) return next();

  try {
    const cookieName = routeType === "admin" ? "facilita_admin" : "facilita_client";
    const token = parseCookies(request.get("cookie") || "")[cookieName] || "";
    if (!token) return next();

    const session = await sessionStore.get(routeType, token);
    const providedToken = request.get("x-csrf-token") || "";
    if (!session?.csrfToken || !safeCompare(providedToken, session.csrfToken)) {
      return response.status(403).json({ error: "Token CSRF invalido ou ausente." });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

app.use(requireCsrfForAuthenticatedRoutes);

app.get("/api/plans", async (_request, response) => {
  try {
    const [rows] = await dbPool.execute(
      `SELECT id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca
       FROM plans
       WHERE ativo = 1
       ORDER BY ordem ASC, nome ASC`,
    );

    response.json({ plans: rows.map(normalizePlan) });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar planos do banco de dados." });
  }
});

app.get("/api/config", (_request, response) => {
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY || "";
  const safePublicKey = publicKey.includes("SEU_PUBLIC_KEY_AQUI") ? "" : publicKey;

  response.json({
    mercadoPagoPublicKey: safePublicKey,
    publicKey: safePublicKey,
  });
});

app.get("/api/nfse/certificado/arquivo", (_request, response) => {
  const certificatePath = process.env.NFSE_CERTIFICADO_A1_PATH || "";
  const resolvedCertificatePath = path.resolve(__dirname, certificatePath);
  const arquivoExiste = fs.existsSync(resolvedCertificatePath);

  response.json({
    ok: arquivoExiste,
    path: certificatePath,
    arquivoExiste,
  });
});

app.post("/api/das-mei/montar-payload", (request, response) => {
  try {
    const payload = montarPayloadGerarDasMei({
      cnpjContratante: DAS_MEI_FACILITA_CNPJ,
      cnpjContribuinte: request.body?.cnpjContribuinte,
      periodoApuracao: request.body?.periodoApuracao,
    });

    response.json({ ok: true, payload });
  } catch (error) {
    response.status(400).json({ ok: false, erro: error.message || "Nao foi possivel montar o payload DAS-MEI." });
  }
});

function getSerproDasErrorMessage(status) {
  if (status === 401) return "token invalido ou credenciais Serpro incorretas";
  if (status === 403) return "sem permissao para esse contribuinte ou servico";
  if (status === 404) return "URL do servico Integra Contador pode estar incorreta";
  return "Erro ao gerar DAS-MEI no Integra Contador";
}

function getDefaultDasPeriodoApuracao(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function hasClientDasAccess(client) {
  if (!client) return false;
  if (Number(client.cliente_login_ativo) === 0) return false;
  if (["blocked", "cancelled"].includes(String(client.status || ""))) return false;
  return Boolean(Number(client.has_paid_payment) || Number(client.has_active_subscription));
}

function parseDasMeiDados(dados) {
  if (!dados) return null;
  if (Array.isArray(dados)) return dados[0] || null;
  if (typeof dados === "object") return dados;

  try {
    const parsed = JSON.parse(dados);
    return Array.isArray(parsed) ? parsed[0] || null : parsed;
  } catch {
    return null;
  }
}

let customerDocumentsReady = false;
let customerDocumentFilesReady = false;

async function ensureCustomerDocumentsTable() {
  if (customerDocumentsReady) return;
  await dbPool.query("SELECT id FROM customer_documents LIMIT 0");
  customerDocumentsReady = true;
}

async function ensureCustomerDocumentFilesTable() {
  if (customerDocumentFilesReady) return;
  await ensureCustomerDocumentsTable();

  await dbPool.query("SELECT document_id, storage_key, sha256 FROM customer_document_files LIMIT 0");
  customerDocumentFilesReady = true;
}

function formatDasCompetencia(periodoApuracao = "") {
  const period = String(periodoApuracao || "");
  if (!/^\d{6}$/.test(period)) return period || "DAS-MEI";
  return `${period.slice(4, 6)}/${period.slice(0, 4)}`;
}

function sanitizeDownloadFileName(fileName = "documento") {
  const cleaned = String(fileName || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);

  return cleaned || "documento";
}

async function persistPrivateDocument({ buffer, extension, mimeType }) {
  await scanDocumentBuffer(buffer);
  const storageKey = await documentStorage.put({ buffer, extension, mimeType });
  return {
    storageDriver: documentStorage.driver,
    storageKey,
    fileSize: buffer.length,
    sha256: documentSha256(buffer),
  };
}

async function loadPrivateDocument(document) {
  const buffer = document.storage_key
    ? await documentStorage.get(document.storage_key)
    : Buffer.from(String(document.base64_data || ""), "base64");
  if (!buffer.length) throw Object.assign(new Error("Arquivo do documento nao encontrado."), { status: 404 });
  if (document.sha256 && documentSha256(buffer) !== document.sha256) {
    throw Object.assign(new Error("Integridade do documento comprometida."), { status: 500 });
  }
  return buffer;
}

function parseSerproDate(value = "") {
  const digits = normalizeDigits(value);
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

async function saveDasDocumentForClient({ userId, periodoApuracao, cnpjContribuinte, dasData, pdfBase64 }) {
  await ensureCustomerDocumentFilesTable();

  const pdfBuffer = Buffer.from(String(pdfBase64 || ""), "base64");
  const validatedFile = await validateUploadedDocument({ buffer: pdfBuffer, originalname: "documento.pdf" });
  const storedFile = await persistPrivateDocument({ buffer: pdfBuffer, ...validatedFile });

  const competenciaLabel = formatDasCompetencia(periodoApuracao);
  const title = `DAS-MEI ${competenciaLabel}`;
  const fileName = `DAS-MEI-${cnpjContribuinte}-${periodoApuracao}.pdf`;
  const detalhe = Array.isArray(dasData?.detalhamento) ? dasData.detalhamento[0] : null;
  const dueDate = parseSerproDate(detalhe?.dataVencimento);
  const value = detalhe?.valores?.total ? Number(detalhe.valores.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
  const noteParts = [`Competencia ${competenciaLabel}`];
  if (dueDate) noteParts.push(`vencimento ${new Date(`${dueDate}T00:00:00`).toLocaleDateString("pt-BR")}`);
  if (value) noteParts.push(`valor ${value}`);

  const [existingRows] = await dbPool.execute(
    `SELECT id FROM customer_documents
     WHERE user_id = :userId
       AND titulo = :title
     LIMIT 1`,
    { userId, title },
  );

  let documentId = existingRows[0]?.id;

  if (!documentId) {
    const [insertResult] = await dbPool.execute(
      `INSERT INTO customer_documents (user_id, titulo, tipo, status, observacao, data_emissao)
       VALUES (:userId, :title, 'documento', 'aprovado', :observacao, NOW())`,
      {
        userId,
        title,
        observacao: noteParts.join(" - "),
      },
    );
    documentId = insertResult.insertId;
  } else {
    await dbPool.execute(
      `UPDATE customer_documents
       SET status = 'aprovado',
           observacao = :observacao,
           data_emissao = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :documentId AND user_id = :userId`,
      {
        documentId,
        userId,
        observacao: noteParts.join(" - "),
      },
    );
  }

  const fileUrl = `/api/client/documents/${documentId}/download`;

  const [previousFiles] = await dbPool.execute(
    "SELECT storage_key FROM customer_document_files WHERE document_id = :documentId LIMIT 1",
    { documentId },
  );

  try {
    await dbPool.execute(
    `INSERT INTO customer_document_files
       (document_id, file_name, mime_type, base64_data, storage_driver, storage_key, file_size, sha256)
     VALUES
       (:documentId, :fileName, :mimeType, NULL, :storageDriver, :storageKey, :fileSize, :sha256)
     ON DUPLICATE KEY UPDATE
       file_name = VALUES(file_name),
       mime_type = VALUES(mime_type),
       base64_data = NULL,
       storage_driver = VALUES(storage_driver),
       storage_key = VALUES(storage_key),
       file_size = VALUES(file_size),
       sha256 = VALUES(sha256),
       updated_at = CURRENT_TIMESTAMP`,
    {
      documentId,
      fileName,
      mimeType: validatedFile.mimeType,
      ...storedFile,
    },
    );
  } catch (error) {
    await documentStorage.delete(storedFile.storageKey).catch(() => {});
    throw error;
  }

  const previousStorageKey = previousFiles[0]?.storage_key;
  if (previousStorageKey && previousStorageKey !== storedFile.storageKey) {
    await documentStorage.delete(previousStorageKey).catch((error) => console.error("Erro ao remover arquivo substituido:", error));
  }

  await dbPool.execute(
    `UPDATE customer_documents
     SET arquivo_url = :fileUrl,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :documentId AND user_id = :userId`,
    { documentId, userId, fileUrl },
  );

  return {
    id: documentId,
    titulo: title,
    tipo: "documento",
    status: "aprovado",
    arquivo_url: fileUrl,
    observacao: noteParts.join(" - "),
    fileName,
  };
}

app.post("/api/das-mei/gerar", (_request, response) => {
  response.status(410).json({ error: "Use a geracao de DAS autenticada na area do cliente." });
});

app.post("/api/client/das-mei/gerar", requireClientSession, dasLimiter, async (request, response) => {
  try {
    const periodoApuracao = request.body?.periodoApuracao || getDefaultDasPeriodoApuracao();
    if (!/^\d{6}$/.test(String(periodoApuracao))) {
      return response.status(400).json({ error: "Competencia invalida. Use o formato AAAAMM." });
    }
    const [rows] = await dbPool.execute(
      `SELECT u.id, u.nome, u.cnpj, u.status, u.cliente_login_ativo,
              EXISTS(
                SELECT 1 FROM payments p
                WHERE p.user_id = u.id AND p.status IN ('approved', 'paid', 'pago')
              ) AS has_paid_payment,
              EXISTS(
                SELECT 1 FROM subscriptions s
                WHERE s.user_id = u.id AND s.status IN ('authorized', 'active')
              ) AS has_active_subscription
       FROM users u
       WHERE u.id = :userId
       LIMIT 1`,
      { userId: request.clientSession.userId },
    );
    const client = rows[0];
    const cnpjContribuinte = normalizeDigits(client?.cnpj || "");

    if (!client) return response.status(404).json({ error: "Cliente nao encontrado." });
    if (!hasClientDasAccess(client)) {
      return response.status(403).json({ error: "A geracao do DAS exige pagamento aprovado ou assinatura ativa." });
    }
    if (cnpjContribuinte.length !== 14) {
      return response.status(400).json({ error: "Cadastre um CNPJ valido antes de solicitar o DAS-MEI." });
    }

    const resposta = await gerarDasMei({ cnpjContribuinte, periodoApuracao });
    const dasData = parseDasMeiDados(resposta?.dados);
    const pdfBase64 = dasData?.pdf || "";

    if (!pdfBase64) {
      return response.json({
        ok: true,
        periodoApuracao,
        cnpjContribuinte,
        resposta,
        mensagem: resposta?.mensagens?.[0]?.texto || "A Serpro respondeu sem PDF para esta competencia.",
      });
    }

    const document = await saveDasDocumentForClient({
      userId: request.clientSession.userId,
      periodoApuracao,
      cnpjContribuinte,
      dasData,
      pdfBase64,
    });

    response.json({
      ok: true,
      periodoApuracao,
      cnpjContribuinte,
      razaoSocial: dasData?.razaoSocial || client.nome,
      document,
      mensagens: resposta?.mensagens || [],
    });
  } catch (error) {
    const status = error.status || 500;
    response.status(status).json({
      ok: false,
      status,
      error: getSerproDasErrorMessage(status),
      details: error.details || error.message || "Erro desconhecido ao solicitar DAS-MEI.",
    });
  }
});

app.get("/api/client/documents/:documentId/download", requireClientSession, async (request, response) => {
  try {
    await ensureCustomerDocumentFilesTable();

    const documentId = Number(request.params.documentId);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      return response.status(400).json({ error: "Documento invalido." });
    }

    const [rows] = await dbPool.execute(
      `SELECT d.id, d.user_id, d.titulo, f.file_name, f.mime_type, f.base64_data, f.storage_key, f.sha256
       FROM customer_documents d
       JOIN customer_document_files f ON f.document_id = d.id
       WHERE d.id = :documentId
         AND d.user_id = :userId
       LIMIT 1`,
      {
        documentId,
        userId: request.clientSession.userId,
      },
    );

    const document = rows[0];
    if (!document) return response.status(404).json({ error: "Documento nao encontrado." });

    const buffer = await loadPrivateDocument(document);
    response.setHeader("Content-Type", document.mime_type || "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${String(document.file_name || "documento.pdf").replace(/"/g, "")}"`);
    response.send(buffer);
  } catch (error) {
    console.error("Erro ao baixar documento do cliente:", error);
    response.status(error.status || 500).json({ error: error.message || "Erro ao baixar documento." });
  }
});

app.get("/api/serpro/token/teste", requireAdminKey, async (_request, response) => {
  try {
    const tokenData = await gerarTokenSerpro();

    response.json({
      ok: true,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      token_received: Boolean(tokenData.access_token),
    });
  } catch (error) {
    response.status(error.status || 500).json({
      ok: false,
      erro: error.message || "Nao foi possivel gerar token Serpro.",
    });
  }
});

app.post("/api/customers/cnpj", (_request, response) => {
  response.status(410).json({ error: "Cadastre o CNPJ pela area autenticada do cliente." });
});

app.post("/api/cnpj/consultar", cnpjLookupLimiter, async (request, response) => {
  try {
    const cnpj = normalizeDigits(request.body?.cnpj || "");
    const company = await consultarOpenCnpj(cnpj);

    response.json({
      ok: true,
      company,
    });
  } catch (error) {
    console.error("Erro ao consultar CNPJ:", error.message);
    response.status(error.status || 500).json({ error: error.message || "Erro ao consultar CNPJ." });
  }
});

const clientAuthNeutralMessage = "Se o cadastro estiver apto, enviaremos as instrucoes para o e-mail informado.";

async function issueClientAuthToken(userId, purpose) {
  const normalizedPurpose = normalizeClientAuthPurpose(purpose);
  if (!normalizedPurpose || !userId) return null;
  const authToken = createClientAuthToken();
  await dbPool.execute(
    `INSERT INTO client_auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES (:userId, :purpose, :tokenHash, :expiresAt)`,
    { userId, purpose: normalizedPurpose, tokenHash: authToken.tokenHash, expiresAt: authToken.expiresAt },
  );
  return authToken;
}

async function sendClientAuthToken(email, purpose) {
  const normalizedPurpose = normalizeClientAuthPurpose(purpose);
  const normalizedEmail = cleanEmail(email);
  if (!normalizedPurpose || !normalizedEmail) return;

  const [rows] = await dbPool.execute(
    `SELECT u.id, u.nome, u.email, u.senha_hash
     FROM users u
     WHERE LOWER(u.email) = :email
       AND u.cliente_login_ativo = 1
       AND u.status NOT IN ('blocked', 'cancelled')
       AND EXISTS (
         SELECT 1 FROM subscriptions s
         WHERE s.user_id = u.id AND s.status IN ('pending', 'authorized', 'active')
         UNION ALL
         SELECT 1 FROM payments p
         WHERE p.user_id = u.id AND p.status IN ('approved', 'paid', 'pago')
       )
     LIMIT 1`,
    { email: normalizedEmail },
  );
  const user = rows[0];
  if (!user) return;
  if (normalizedPurpose === "setup" && user.senha_hash) return;
  if (normalizedPurpose === "recovery" && !user.senha_hash) return;

  const authToken = await issueClientAuthToken(user.id, normalizedPurpose);

  const actionLabel = normalizedPurpose === "setup" ? "criar seu acesso" : "redefinir sua senha";
  const actionUrl = `${frontendUrl.replace(/\/$/, "")}/cliente/?auth_action=${normalizedPurpose}&auth_token=${authToken.token}`;
  const safeName = escapeEmailHtml(user.nome || "cliente");
  const safeUrl = escapeEmailHtml(actionUrl);
  await enviarEmailSistema({
    dedupeKey: `client-auth-${normalizedPurpose}-${authToken.tokenHash.slice(0, 32)}`,
    tipo: `client_auth_${normalizedPurpose}`,
    userId: user.id,
    to: user.email,
    subject: normalizedPurpose === "setup" ? "Crie seu acesso ao Facilita MEI" : "Redefina sua senha do Facilita MEI",
    text: `Ola, ${user.nome || "cliente"}. Acesse ${actionUrl} para ${actionLabel}. O link expira em 30 minutos e pode ser usado uma unica vez.`,
    html: `<p>Ola, ${safeName}.</p><p>Use o link abaixo para ${actionLabel}:</p><p><a href="${safeUrl}">${safeUrl}</a></p><p>O link expira em 30 minutos e pode ser usado uma unica vez.</p>`,
  });
}

async function confirmClientAuthToken({ token, password, purpose, cnpj }) {
  const normalizedPurpose = normalizeClientAuthPurpose(purpose);
  const normalizedToken = String(token || "").trim();
  if (!normalizedPurpose || !/^[a-f0-9]{64}$/i.test(normalizedToken)) {
    const error = new Error("Link invalido ou expirado.");
    error.status = 400;
    throw error;
  }
  if (String(password || "").length < 8) {
    const error = new Error("A senha precisa ter pelo menos 8 caracteres.");
    error.status = 400;
    throw error;
  }

  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT t.id, t.user_id, u.id AS user_id, u.nome, u.email, u.status, u.cliente_login_ativo
       FROM client_auth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = :tokenHash
         AND t.purpose = :purpose
         AND t.used_at IS NULL
         AND t.expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      { tokenHash: hashClientAuthToken(normalizedToken), purpose: normalizedPurpose },
    );
    const user = rows[0];
    if (!user || Number(user.cliente_login_ativo) === 0 || ["blocked", "cancelled"].includes(user.status)) {
      const error = new Error("Link invalido ou expirado.");
      error.status = 400;
      throw error;
    }

    const { hash, salt } = hashPassword(password);
    await connection.execute(
      `UPDATE users
       SET senha_hash = :hash, senha_salt = :salt, updated_at = CURRENT_TIMESTAMP
       WHERE id = :userId`,
      { hash, salt, userId: user.user_id },
    );
    await connection.execute(
      `UPDATE client_auth_tokens SET used_at = NOW()
       WHERE user_id = :userId AND used_at IS NULL`,
      { userId: user.user_id },
    );
    await connection.commit();
    if (normalizedPurpose === "setup") {
      await vincularCnpjAoCliente({ customerId: user.user_id, cnpj });
    }
    await sessionStore.deleteByUserId("client", user.user_id);
    return user;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

for (const purpose of ["setup", "recovery"]) {
  app.post(`/api/client/auth/${purpose}/request`, clientAuthLimiter, async (request, response) => {
    try {
      await sendClientAuthToken(request.body?.email, purpose);
    } catch (error) {
      console.error(`Erro ao solicitar token de ${purpose}:`, error.message);
    }
    response.json({ ok: true, message: clientAuthNeutralMessage });
  });

  app.post(`/api/client/auth/${purpose}/confirm`, clientAuthLimiter, async (request, response) => {
    try {
      const user = await confirmClientAuthToken({
        token: request.body?.token,
        password: request.body?.password,
        cnpj: request.body?.cnpj,
        purpose,
      });
      const session = await createClientSession(user);
      setClientCookie(response, session.token, session.expiresAt);
      response.json({
        ok: true,
        csrfToken: session.csrfToken,
        expiresAt: new Date(session.expiresAt).toISOString(),
        client: { id: user.user_id, nome: user.nome, email: user.email, status: user.status },
      });
    } catch (error) {
      response.status(error.status || 500).json({ error: error.message || "Nao foi possivel definir a senha." });
    }
  });
}

app.post("/api/client/auth/setup", async (_request, response) => {
  return response.status(410).json({
    error: "Fluxo descontinuado. Solicite um link de ativacao por e-mail.",
  });
});

app.post("/api/client/auth/login", clientAuthLimiter, async (request, response) => {
  try {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");

    const [rows] = await dbPool.execute(
      `SELECT id, nome, email, senha_hash, senha_salt, cliente_login_ativo, status
       FROM users
       WHERE LOWER(email) = :email
       LIMIT 1`,
      { email },
    );
    const user = rows[0];

    if (!user || !verifyPassword(password, user.senha_hash, user.senha_salt)) {
      return response.status(401).json({ error: "E-mail ou senha invalidos." });
    }

    if (Number(user.cliente_login_ativo) === 0 || user.status === "blocked" || user.status === "cancelled") {
      return response.status(403).json({ error: "Acesso do cliente bloqueado. Fale com o atendimento." });
    }

    const session = await createClientSession(user);
    setClientCookie(response, session.token, session.expiresAt);
    response.json({
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.expiresAt).toISOString(),
      client: { id: user.id, nome: user.nome, email: user.email, status: user.status },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao fazer login do cliente." });
  }
});

app.post("/api/client/auth/logout", requireClientSession, async (request, response, next) => {
  try {
  const token = parseCookies(request.get("cookie") || "").facilita_client || "";
  if (token) await sessionStore.delete("client", token);
  clearClientCookie(response);
  response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/client/auth/me", requireClientSession, async (request, response) => {
  try {
    const [rows] = await dbPool.execute(
      `SELECT id, nome, email, telefone, whatsapp, documento, cnpj, status, cliente_login_ativo, created_at,
              razao_social, nome_fantasia, data_abertura, cep, logradouro, numero, complemento,
              bairro, municipio, uf, cnae_principal_codigo, cnae_principal_descricao,
              cnae_secundario_codigo, cnae_secundario_descricao, capital_social,
              inscricao_municipal, inscricao_estadual, alvara_status, banco, agencia, conta, tipo_conta
       FROM users
       WHERE id = :userId
       LIMIT 1`,
      { userId: request.clientSession.userId },
    );
    if (!rows[0]) return response.status(404).json({ error: "Cliente nao encontrado." });
    response.json({ client: decryptBankFields(rows[0]), csrfToken: request.clientSession.csrfToken });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar cliente." });
  }
});

app.patch("/api/client/settings/company", requireClientSession, companyLimiter, async (request, response) => {
  try {
    const company = await vincularCnpjAoCliente({
      customerId: request.clientSession.userId,
      cnpj: request.body?.cnpj,
    });
    response.json({ ok: true, message: "Dados empresariais atualizados com sucesso.", company });
  } catch (error) {
    console.error("Erro ao atualizar CNPJ autenticado:", error.message);
    response.status(error.status || 500).json({ error: error.message || "Erro ao atualizar dados empresariais." });
  }
});

app.patch("/api/client/settings/address", requireClientSession, async (request, response) => {
  try {
    const userId = request.clientSession.userId;
    const payload = {
      cep: normalizeDigits(request.body?.cep || "").slice(0, 8) || null,
      logradouro: cleanText(request.body?.logradouro, 180),
      numero: cleanText(request.body?.numero, 30),
      complemento: cleanText(request.body?.complemento, 120),
      bairro: cleanText(request.body?.bairro, 120),
      municipio: cleanText(request.body?.municipio, 120),
      uf: cleanUf(request.body?.uf),
      userId,
    };

    await dbPool.execute(
      `UPDATE users
       SET cep = :cep,
           logradouro = :logradouro,
           numero = :numero,
           complemento = :complemento,
           bairro = :bairro,
           municipio = :municipio,
           uf = :uf,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :userId`,
      payload,
    );

    response.json({ ok: true, message: "Endereco atualizado com sucesso." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao salvar endereco do cliente." });
  }
});

app.patch("/api/client/settings/bank", requireClientSession, async (request, response) => {
  try {
    const userId = request.clientSession.userId;
    const payload = {
      banco: encryptSensitive(cleanText(request.body?.banco, 120)),
      agencia: encryptSensitive(cleanText(request.body?.agencia, 30)),
      conta: encryptSensitive(cleanText(request.body?.conta, 40)),
      tipoConta: encryptSensitive(cleanText(request.body?.tipo_conta || request.body?.tipoConta, 40)),
      userId,
    };

    await dbPool.execute(
      `UPDATE users
       SET banco = :banco,
           agencia = :agencia,
           conta = :conta,
           tipo_conta = :tipoConta,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :userId`,
      payload,
    );

    response.json({ ok: true, message: "Dados bancarios atualizados com sucesso." });
  } catch (error) {
    console.error(error);
    response.status(error.status || 500).json({ error: error.message || "Erro ao salvar dados bancarios do cliente." });
  }
});

app.get("/api/client/dashboard", requireClientSession, async (request, response) => {
  try {
    const userId = request.clientSession.userId;
    const [
      [clientRows],
      [subscriptionRows],
      [paymentRows],
      [contractRows],
      [documentRows],
      [paymentSummaryRows],
      [documentSummaryRows],
      [contractSummaryRows],
      [declarationRows],
    ] = await Promise.all([
      dbPool.execute(
        `SELECT id, nome, email, telefone, whatsapp, documento, cnpj, status, created_at,
                razao_social, nome_fantasia, data_abertura, cep, logradouro, numero, complemento,
                bairro, municipio, uf, cnae_principal_codigo, cnae_principal_descricao,
                cnae_secundario_codigo, cnae_secundario_descricao, capital_social,
                inscricao_municipal, inscricao_estadual, alvara_status, banco, agencia, conta, tipo_conta
         FROM users
         WHERE id = :userId
         LIMIT 1`,
        { userId },
      ),
      dbPool.execute(
        `SELECT
           s.id,
           s.plan_id,
           s.status,
           s.valor,
           s.data_inicio,
           s.data_proxima_cobranca,
           s.metodo_pagamento,
           s.init_point,
           p.nome AS plan_name,
           p.descricao AS plan_description
         FROM subscriptions s
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE s.user_id = :userId
         ORDER BY s.created_at DESC
         LIMIT 5`,
        { userId },
      ),
      dbPool.execute(
        `SELECT id, subscription_id, mercado_pago_payment_id, valor, status, data_pagamento, created_at
         FROM payments
         WHERE user_id = :userId
         ORDER BY COALESCE(data_pagamento, created_at) DESC
         LIMIT 12`,
        { userId },
      ),
      dbPool.execute(
        `SELECT id, subscription_id, plan_id, titulo, status, arquivo_url, assinatura_url, data_envio, data_assinatura, data_expiracao, observacao, created_at
         FROM customer_contracts
         WHERE user_id = :userId
         ORDER BY created_at DESC
         LIMIT 12`,
        { userId },
      ),
      dbPool.execute(
        `SELECT id, titulo, tipo, status, arquivo_url, observacao, data_emissao, data_assinatura, created_at
         FROM customer_documents
         WHERE user_id = :userId
         ORDER BY created_at DESC
         LIMIT 12`,
        { userId },
      ),
      dbPool.execute(
        `SELECT
           COALESCE(SUM(CASE
             WHEN status IN ('approved', 'paid', 'pago')
              AND COALESCE(data_pagamento, created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
              AND COALESCE(data_pagamento, created_at) < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
             THEN valor ELSE 0 END), 0) AS monthlyRevenue,
           COALESCE(SUM(CASE
             WHEN status IN ('approved', 'paid', 'pago')
              AND COALESCE(data_pagamento, created_at) >= MAKEDATE(YEAR(CURDATE()), 1)
              AND COALESCE(data_pagamento, created_at) < MAKEDATE(YEAR(CURDATE()) + 1, 1)
             THEN valor ELSE 0 END), 0) AS annualRevenue,
           COALESCE(SUM(status IN ('pending', 'in_process')), 0) AS pendingPayments,
           COUNT(*) AS totalPayments
         FROM payments
         WHERE user_id = :userId`,
        { userId },
      ),
      dbPool.execute(
        `SELECT
           COALESCE(SUM(status IN ('pendente', 'vencido', 'recusado')), 0) AS pendingDocuments,
           COALESCE(SUM(
             (LOWER(COALESCE(titulo, '')) LIKE '%nota%' OR LOWER(COALESCE(titulo, '')) LIKE '%nf%')
             AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
             AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
           ), 0) AS invoicesThisMonth
         FROM customer_documents
         WHERE user_id = :userId`,
        { userId },
      ),
      dbPool.execute(
        `SELECT COALESCE(SUM(status IN ('pendente', 'enviado', 'expirado')), 0) AS pendingContracts
         FROM customer_contracts
         WHERE user_id = :userId`,
        { userId },
      ),
      dbPool.execute(
        `SELECT id, titulo, tipo, status, arquivo_url, observacao, data_emissao, created_at
         FROM customer_documents
         WHERE user_id = :userId
           AND (LOWER(COALESCE(titulo, '')) LIKE '%declara%' OR LOWER(COALESCE(titulo, '')) LIKE '%dasn%')
         ORDER BY COALESCE(data_emissao, created_at) DESC
         LIMIT 1`,
        { userId },
      ),
    ]);

    const activeSubscription = subscriptionRows.find((subscription) => ["active", "authorized"].includes(subscription.status)) || subscriptionRows[0] || null;
    const client = decryptBankFields(clientRows[0] || null);
    const paymentSummary = paymentSummaryRows[0] || {};
    const documentSummary = documentSummaryRows[0] || {};
    const contractSummary = contractSummaryRows[0] || {};
    const declaration = declarationRows[0] || null;
    const annualLimit = Number(process.env.MEI_ANNUAL_LIMIT || 81000);
    const pendingPayments = Number(paymentSummary.pendingPayments || 0);
    const pendingDocuments = Number(documentSummary.pendingDocuments || 0);
    const pendingContracts = Number(contractSummary.pendingContracts || 0);
    const pendingTotal = pendingPayments + pendingDocuments + pendingContracts;
    const paidStatuses = new Set(["approved", "paid", "pago"]);
    const pendingStatuses = new Set(["pending", "in_process", "pendente", "enviado", "expirado", "vencido", "recusado"]);
    const companyDocument = normalizeDigits(client?.cnpj || client?.documento || "");
    const dueItems = [];

    if (activeSubscription?.data_proxima_cobranca) {
      dueItems.push({
        type: "subscription",
        title: activeSubscription.plan_name || "Assinatura Facilita",
        description: activeSubscription.status ? `Status: ${activeSubscription.status}` : "Proxima cobranca da assinatura",
        dueDate: activeSubscription.data_proxima_cobranca,
        status: activeSubscription.status,
      });
    }

    paymentRows
      .filter((payment) => pendingStatuses.has(String(payment.status || "").toLowerCase()))
      .slice(0, 4)
      .forEach((payment) => {
        dueItems.push({
          type: "payment",
          title: "Pagamento pendente",
          description: payment.mercado_pago_payment_id || "Registro no Mercado Pago",
          dueDate: payment.data_pagamento || payment.created_at,
          value: payment.valor,
          status: payment.status,
        });
      });

    [...contractRows, ...documentRows]
      .filter((item) => pendingStatuses.has(String(item.status || "").toLowerCase()))
      .slice(0, 4)
      .forEach((item) => {
        dueItems.push({
          type: item.assinatura_url !== undefined ? "contract" : "document",
          title: item.titulo || item.tipo || "Pendencia cadastrada",
          description: item.observacao || statusLabelForApi(item.status),
          dueDate: item.data_expiracao || item.data_emissao || item.data_envio || item.created_at,
          status: item.status,
        });
      });

    const companyChecks = [
      {
        title: "Cadastro do cliente",
        description: client?.status ? `Status: ${client.status}` : "Cliente nao encontrado",
        ok: Boolean(client && !["blocked", "cancelled"].includes(client.status)),
      },
      {
        title: "Assinatura",
        description: activeSubscription ? statusLabelForApi(activeSubscription.status) : "Nenhuma assinatura vinculada",
        ok: Boolean(activeSubscription && ["active", "authorized"].includes(activeSubscription.status)),
      },
      {
        title: "Pagamentos",
        description: pendingPayments ? `${pendingPayments} pagamento(s) pendente(s)` : "Sem pagamentos pendentes",
        ok: pendingPayments === 0,
      },
      {
        title: "Documentos e contratos",
        description: pendingDocuments + pendingContracts ? `${pendingDocuments + pendingContracts} pendencia(s) cadastrada(s)` : "Sem pendencias cadastradas",
        ok: pendingDocuments + pendingContracts === 0,
      },
    ];

    response.json({
      client,
      activeSubscription,
      subscriptions: subscriptionRows,
      payments: paymentRows,
      contracts: contractRows,
      documents: documentRows,
      summary: {
        monthlyRevenue: Number(paymentSummary.monthlyRevenue || 0),
        annualRevenue: Number(paymentSummary.annualRevenue || 0),
        annualLimit,
        annualAvailable: Math.max(annualLimit - Number(paymentSummary.annualRevenue || 0), 0),
        pendingPayments,
        pendingDocuments,
        pendingContracts,
        pendingTotal,
        invoicesThisMonth: Number(documentSummary.invoicesThisMonth || 0),
        paidPayments: paymentRows.filter((payment) => paidStatuses.has(String(payment.status || "").toLowerCase())).length,
        nextDue: activeSubscription?.data_proxima_cobranca || null,
        declaration,
        company: {
          cnpj: companyDocument.length === 14 ? companyDocument : null,
          status: client?.status || null,
          regular: Boolean(client && !["blocked", "cancelled"].includes(client.status) && pendingTotal === 0),
        },
        dueItems: dueItems.slice(0, 6),
        companyChecks,
      },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar area do cliente." });
  }
});

app.post("/api/admin/auth/login", adminLoginLimiter, async (request, response, next) => {
  try {
  const { email, password } = request.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || "Atendimento@facilitameibr.com.br";
  const matches = String(email || "").trim().toLowerCase() === adminEmail.toLowerCase()
    && safeCompare(password || "", process.env.ADMIN_PASSWORD || "");
  if (!matches) return response.status(401).json({ error: "E-mail ou senha invalidos." });
  const admin = { id: null, email: adminEmail, role: "owner" };

  const session = await createAdminSession(admin);
  setAdminCookie(response, session.token, session.expiresAt);

  response.json({
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString(),
    admin: { email: admin.email, role: admin.role },
  });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/auth/logout", requireAdminSession, async (request, response, next) => {
  try {
  const token = parseCookies(request.get("cookie") || "").facilita_admin || "";
  if (token) await sessionStore.delete("admin", token);
  clearAdminCookie(response);
  response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/auth/me", requireAdminSession, (_request, response) => {
  response.json({
    admin: { email: _request.adminSession.email, role: _request.adminSession.role },
    csrfToken: _request.adminSession.csrfToken,
  });
});

app.get("/api/admin/users", requireAdminSession, async (_request, response, next) => {
  try {
    const [rows] = await dbPool.execute(
      "SELECT id, email, role, mfa_enabled, active, last_login_at, created_at FROM admin_users ORDER BY email",
    );
    response.json({ admins: rows });
  } catch (error) { next(error); }
});

app.post("/api/admin/users", requireAdminSession, async (request, response, next) => {
  try {
    const { email, password, role = "viewer", mfaSecret } = request.body || {};
    if (!String(email || "").includes("@") || String(password || "").length < 12) {
      return response.status(400).json({ error: "Informe e-mail e senha com ao menos 12 caracteres." });
    }
    if (!isAdminAuthorized(role, "GET", "/api/admin/dashboard")) return response.status(400).json({ error: "Papel invalido." });
    const normalizedSecret = String(mfaSecret || "").replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z2-7]{16,}$/.test(normalizedSecret)) return response.status(400).json({ error: "Segredo MFA Base32 invalido." });
    const { hash, salt } = hashPassword(password);
    const [result] = await dbPool.execute(
      `INSERT INTO admin_users (email, password_hash, password_salt, role, mfa_secret, mfa_enabled, active)
       VALUES (:email, :hash, :salt, :role, :mfaSecret, 1, 1)`,
      {
        email: String(email).trim().toLowerCase(), hash, salt, role,
        mfaSecret: encryptSensitive(normalizedSecret),
      },
    );
    response.status(201).json({ id: result.insertId, email: String(email).trim().toLowerCase(), role });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return response.status(409).json({ error: "Administrador ja cadastrado." });
    next(error);
  }
});

app.get("/api/admin/dashboard", requireAdminSession, async (_request, response) => {
  try {
    const [[userStats], [subscriptionStats], [paymentStats], [latestCustomers], [latestPayments]] = await Promise.all([
      dbPool.execute(
        `SELECT
          COUNT(*) AS total,
          SUM(status = 'active') AS active,
          SUM(status = 'pending') AS pending,
          SUM(status = 'blocked') AS blocked,
          SUM(status = 'cancelled') AS cancelled,
          SUM(EXISTS(
            SELECT 1 FROM payments paying_payment
            WHERE paying_payment.user_id = users.id
              AND paying_payment.status IN ('approved', 'paid', 'pago')
          )) AS paying,
          SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS newLast30
         FROM users users`,
      ),
      dbPool.execute(
        `SELECT
          COUNT(*) AS total,
          SUM(status IN ('authorized', 'active')) AS active,
          SUM(status = 'pending') AS pending,
          SUM(status = 'cancelled') AS cancelled,
          SUM(status IN ('paused', 'expired', 'rejected')) AS problem
         FROM subscriptions`,
      ),
      dbPool.execute(
        `SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status IN ('approved', 'paid', 'pago') THEN valor ELSE 0 END), 0) AS approvedAmount,
          COALESCE(SUM(CASE WHEN status IN ('approved', 'paid', 'pago') AND COALESCE(data_pagamento, created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN valor ELSE 0 END), 0) AS monthlyApprovedAmount,
          COALESCE(SUM(CASE WHEN status IN ('approved', 'paid', 'pago') AND YEAR(COALESCE(data_pagamento, created_at)) = YEAR(CURDATE()) THEN valor ELSE 0 END), 0) AS annualApprovedAmount,
          COALESCE(AVG(CASE WHEN status IN ('approved', 'paid', 'pago') THEN valor ELSE NULL END), 0) AS averageApprovedAmount,
          SUM(status IN ('approved', 'paid', 'pago')) AS approved,
          SUM(status IN ('pending', 'in_process')) AS pending,
          SUM(status IN ('rejected', 'cancelled', 'refunded', 'charged_back')) AS failed
         FROM payments`,
      ),
      dbPool.execute(
        `SELECT
           u.id, u.nome, u.email, u.telefone, u.status, u.created_at,
            COALESCE(pl.nome, pay_pl.nome) AS plan_name
         FROM users u
         LEFT JOIN subscriptions s ON s.id = (
           SELECT s2.id
           FROM subscriptions s2
           WHERE s2.user_id = u.id
           ORDER BY s2.created_at DESC
           LIMIT 1
         )
          LEFT JOIN plans pl ON pl.id = s.plan_id
          LEFT JOIN payments pay ON pay.id = (
            SELECT p2.id FROM payments p2 WHERE p2.user_id = u.id
            ORDER BY (p2.status IN ('approved', 'paid', 'pago')) DESC, COALESCE(p2.data_pagamento, p2.created_at) DESC LIMIT 1
          )
          LEFT JOIN plans pay_pl ON pay_pl.id = pay.plan_id
         ORDER BY u.created_at DESC
         LIMIT 8`,
      ),
      dbPool.execute(
        `SELECT
           p.id, p.valor, p.status, p.data_pagamento, p.created_at,
           u.nome AS user_name, u.email,
            COALESCE(pl.nome, pay_pl.nome) AS plan_name
         FROM payments p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
          LEFT JOIN plans pl ON pl.id = s.plan_id
          LEFT JOIN plans pay_pl ON pay_pl.id = p.plan_id
         ORDER BY p.created_at DESC
         LIMIT 8`,
      ),
    ]);

    response.json({
      users: userStats[0],
      subscriptions: subscriptionStats[0],
      payments: paymentStats[0],
      latestCustomers,
      latestPayments,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar dashboard administrativo." });
  }
});

app.get("/api/admin/customers", requireAdminSession, async (request, response) => {
  try {
    const search = `%${String(request.query.search || "").trim()}%`;
    const status = String(request.query.status || "").trim();
    const params = { search };
    let statusFilter = "";

    if (status) {
      statusFilter = "AND u.status = :status";
      params.status = status;
    }

    const [rows] = await dbPool.execute(
      `SELECT
        u.id, u.nome, u.email, u.telefone, u.documento, u.status, u.created_at, u.updated_at,
        s.id AS subscription_id,
        s.data_proxima_cobranca,
        s.mercado_pago_subscription_id,
        COALESCE(pl.id, pay_pl.id) AS plan_id,
        COALESCE(pl.nome, pay_pl.nome) AS plan_name,
        COALESCE(s.status, pay.status) AS subscription_status,
        COALESCE(s.valor, pay.valor) AS subscription_value,
        pay.status AS latest_payment_status,
        pay.valor AS latest_payment_value,
        pay.payment_method AS latest_payment_method
       FROM users u
       LEFT JOIN subscriptions s ON s.id = (
         SELECT s2.id
         FROM subscriptions s2
         WHERE s2.user_id = u.id
         ORDER BY s2.created_at DESC
         LIMIT 1
       )
       LEFT JOIN plans pl ON pl.id = s.plan_id
       LEFT JOIN payments pay ON pay.id = (
         SELECT p2.id FROM payments p2 WHERE p2.user_id = u.id
         ORDER BY (p2.status IN ('approved', 'paid', 'pago')) DESC, COALESCE(p2.data_pagamento, p2.created_at) DESC LIMIT 1
       )
       LEFT JOIN plans pay_pl ON pay_pl.id = pay.plan_id
       WHERE (u.nome LIKE :search OR u.email LIKE :search OR u.telefone LIKE :search OR u.documento LIKE :search)
       ${statusFilter}
       ORDER BY u.created_at DESC
       LIMIT 120`,
      params,
    );

    response.json({ customers: rows });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao listar clientes." });
  }
});

app.get("/api/admin/customers/:id", requireAdminSession, async (request, response) => {
  try {
    const userId = Number(request.params.id);
    await ensureCustomerDocumentsTable();
    const [[users], [subscriptions], [payments]] = await Promise.all([
      dbPool.execute("SELECT * FROM users WHERE id = :userId LIMIT 1", { userId }),
      dbPool.execute(
        `SELECT s.*, pl.nome AS plan_name
         FROM subscriptions s
         JOIN plans pl ON pl.id = s.plan_id
         WHERE s.user_id = :userId
         ORDER BY s.created_at DESC`,
        { userId },
      ),
      dbPool.execute(
        `SELECT p.*, pl.nome AS plan_name
         FROM payments p
         LEFT JOIN plans pl ON pl.id = p.plan_id
         WHERE p.user_id = :userId
         ORDER BY p.created_at DESC
         LIMIT 80`,
        { userId },
      ),
    ]);

    let documents = [];
    try {
      [documents] = await dbPool.execute(
        `SELECT id, user_id, titulo, tipo, status, arquivo_url, observacao, data_emissao, data_assinatura, created_at, updated_at
         FROM customer_documents
         WHERE user_id = :userId
         ORDER BY created_at DESC
         LIMIT 80`,
        { userId },
      );
    } catch (documentsError) {
      if (documentsError.code !== "ER_NO_SUCH_TABLE") throw documentsError;
      console.warn("Tabela customer_documents ainda nao existe. Retornando documentos vazios.");
    }

    if (!users[0]) return response.status(404).json({ error: "Cliente nao encontrado." });
    response.json({ customer: users[0], subscriptions, payments, documents });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar cliente." });
  }
});

app.post(
  "/api/admin/customers/:id/documents",
  requireAdminSession,
  upload.single("documento"),
  async (request, response) => {
    let storedFile = null;
    try {
      await ensureCustomerDocumentFilesTable();

      const userId = Number(request.params.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return response.status(400).json({ error: "Cliente invalido." });
      }

      const [userRows] = await dbPool.execute("SELECT id FROM users WHERE id = :userId LIMIT 1", { userId });
      if (!userRows[0]) return response.status(404).json({ error: "Cliente nao encontrado." });

      if (!request.file) {
        return response.status(400).json({ error: "Selecione um arquivo para enviar." });
      }

      const titulo = String(request.body?.titulo || "").trim().slice(0, 160) || request.file.originalname || "Documento";
      const tipo = String(request.body?.tipo || "documento").trim().slice(0, 80) || "documento";
      const observacao = String(request.body?.observacao || "").trim().slice(0, 1000) || null;
      const status = String(request.body?.status || "aprovado").trim().slice(0, 40) || "aprovado";
      const fileName = sanitizeDownloadFileName(request.file.originalname || `${titulo}.pdf`);
      const validatedFile = await validateUploadedDocument(request.file);
      storedFile = await persistPrivateDocument({ buffer: request.file.buffer, ...validatedFile });

      const [insertResult] = await dbPool.execute(
        `INSERT INTO customer_documents
          (user_id, titulo, tipo, status, arquivo_url, observacao, data_emissao)
         VALUES
          (:userId, :titulo, :tipo, :status, NULL, :observacao, CURDATE())`,
        { userId, titulo, tipo, status, observacao },
      );

      const documentId = insertResult.insertId;
      const fileUrl = `/api/client/documents/${documentId}/download`;

      await dbPool.execute(
        `INSERT INTO customer_document_files
          (document_id, file_name, mime_type, base64_data, storage_driver, storage_key, file_size, sha256)
         VALUES
          (:documentId, :fileName, :mimeType, NULL, :storageDriver, :storageKey, :fileSize, :sha256)`,
        {
          documentId,
          fileName,
          mimeType: validatedFile.mimeType,
          ...storedFile,
        },
      );

      await dbPool.execute(
        `UPDATE customer_documents
         SET arquivo_url = :fileUrl,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :documentId`,
        { documentId, fileUrl },
      );

      response.status(201).json({
        ok: true,
        document: {
          id: documentId,
          user_id: userId,
          titulo,
          tipo,
          status,
          arquivo_url: fileUrl,
          observacao,
          file_name: fileName,
        },
      });
    } catch (error) {
      if (storedFile?.storageKey) await documentStorage.delete(storedFile.storageKey).catch(() => {});
      console.error("Erro ao enviar documento do cliente:", error);
      response.status(error.status || 500).json({ error: error.message || "Erro ao enviar documento." });
    }
  },
);

app.get("/api/admin/documents/:documentId/download", requireAdminSession, async (request, response) => {
  try {
    await ensureCustomerDocumentFilesTable();

    const documentId = Number(request.params.documentId);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      return response.status(400).json({ error: "Documento invalido." });
    }

    const [rows] = await dbPool.execute(
      `SELECT d.id, d.titulo, f.file_name, f.mime_type, f.base64_data, f.storage_key, f.sha256
       FROM customer_documents d
       JOIN customer_document_files f ON f.document_id = d.id
       WHERE d.id = :documentId
       LIMIT 1`,
      { documentId },
    );

    const document = rows[0];
    if (!document) return response.status(404).json({ error: "Documento nao encontrado." });

    const buffer = await loadPrivateDocument(document);
    response.setHeader("Content-Type", document.mime_type || "application/octet-stream");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${String(document.file_name || "documento").replace(/"/g, "")}"`,
    );
    response.send(buffer);
  } catch (error) {
    console.error("Erro ao baixar documento no admin:", error);
    response.status(error.status || 500).json({ error: error.message || "Erro ao baixar documento." });
  }
});

app.post("/api/admin/customers", requireAdminSession, async (request, response) => {
  try {
    const body = request.body || {};
    const nome = String(body.nome || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const telefone = normalizeDigits(body.telefone || body.whatsapp || "");
    const documento = normalizeDigits(body.documento || "");
    const password = String(body.password || "");
    const allowedStatuses = ["pending", "active", "blocked", "cancelled"];
    const status = allowedStatuses.includes(body.status) ? body.status : "pending";
    const loginAtivo = body.cliente_login_ativo === false || body.cliente_login_ativo === "0" ? 0 : 1;
    const planId = String(body.plan_id || "").trim();
    const allowedSubscriptionStatuses = ["pending", "authorized", "active", "paused", "cancelled", "expired", "rejected"];
    const subscriptionStatus = allowedSubscriptionStatuses.includes(body.subscription_status)
      ? body.subscription_status
      : "active";

    if (!nome) return response.status(400).json({ error: "Informe o nome do cliente." });
    if (!email || !email.includes("@")) return response.status(400).json({ error: "Informe um e-mail valido para login." });
    if (password.length < 8) return response.status(400).json({ error: "A senha do cliente precisa ter pelo menos 8 caracteres." });

    let selectedPlan = null;
    if (planId) {
      const [planRows] = await dbPool.execute(
        `SELECT id, nome, valor, ativo
         FROM plans
         WHERE id = :planId
         LIMIT 1`,
        { planId },
      );
      selectedPlan = planRows[0] || null;
      if (!selectedPlan) return response.status(400).json({ error: "Plano selecionado nao existe no banco." });
      if (!Number(selectedPlan.ativo)) return response.status(400).json({ error: "Plano selecionado esta inativo." });
    }

    const { hash, salt } = hashPassword(password);

    const connection = await dbPool.getConnection();
    let customerId = null;
    let subscriptionId = null;

    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO users
          (nome, email, telefone, whatsapp, documento, cnpj, senha_hash, senha_salt, cliente_login_ativo, status)
         VALUES
          (:nome, :email, :telefone, :telefone, :documento, :cnpj, :senhaHash, :senhaSalt, :loginAtivo, :status)`,
        {
          nome,
          email,
          telefone,
          documento,
          cnpj: documento.length === 14 ? documento : null,
          senhaHash: hash,
          senhaSalt: salt,
          loginAtivo,
          status,
        },
      );

      customerId = result.insertId;

      if (selectedPlan) {
        const now = new Date();
        const nextCharge = new Date(now);
        nextCharge.setMonth(nextCharge.getMonth() + 1);
        const localSubscriptionRef = `admin-local-${customerId}-${Date.now()}-${crypto.randomUUID()}`;

        const [subscriptionResult] = await connection.execute(
          `INSERT INTO subscriptions
            (user_id, plan_id, mercado_pago_subscription_id, status, valor, data_inicio, data_proxima_cobranca, metodo_pagamento, raw_payload)
           VALUES
            (:customerId, :planId, :subscriptionRef, :subscriptionStatus, :valor, :startAt, :nextChargeAt, 'manual_admin', :rawPayload)`,
          {
            customerId,
            planId: selectedPlan.id,
            subscriptionRef: localSubscriptionRef,
            subscriptionStatus,
            valor: selectedPlan.valor,
            startAt: now,
            nextChargeAt: nextCharge,
            rawPayload: JSON.stringify({
              origem: "admin_manual",
              plan_id: selectedPlan.id,
              plan_name: selectedPlan.nome,
              created_by: "admin",
            }),
          },
        );
        subscriptionId = subscriptionResult.insertId;
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [rows] = await dbPool.execute("SELECT id, nome, email, telefone, documento, status, created_at FROM users WHERE id = :id", {
      id: customerId,
    });

    response.status(201).json({ ok: true, customer: rows[0], subscriptionId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return response.status(409).json({ error: "Ja existe um cliente cadastrado com este e-mail." });
    }

    if (error.code === "ER_BAD_FIELD_ERROR") {
      return response.status(500).json({
        error: "Campos de login do cliente ainda nao existem no banco. Rode database/add-customer-login-fields.sql.",
      });
    }

    console.error(error);
    response.status(500).json({ error: "Erro ao criar cliente." });
  }
});

app.patch("/api/admin/customers/:id", requireAdminSession, async (request, response) => {
  try {
    const userId = Number(request.params.id);
    const body = request.body || {};
    const allowedStatuses = ["pending", "active", "blocked", "cancelled"];
    const status = allowedStatuses.includes(body.status) ? body.status : "pending";

    await dbPool.execute(
      `UPDATE users
       SET nome = :nome,
           email = :email,
           telefone = :telefone,
           documento = :documento,
           status = :status,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :userId`,
      {
        userId,
        nome: String(body.nome || "").trim(),
        email: String(body.email || "").trim(),
        telefone: normalizeDigits(body.telefone || ""),
        documento: normalizeDigits(body.documento || ""),
        status,
      },
    );

    response.json({ ok: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao salvar cliente." });
  }
});

app.delete("/api/admin/customers/:id", requireAdminSession, async (request, response) => {
  const connection = await dbPool.getConnection();

  try {
    const userId = Number(request.params.id);

    await connection.beginTransaction();
    await connection.execute("DELETE FROM customer_contracts WHERE user_id = :userId", { userId });
    await connection.execute("DELETE FROM customer_documents WHERE user_id = :userId", { userId });
    await connection.execute("DELETE FROM payments WHERE user_id = :userId", { userId });
    await connection.execute("DELETE FROM subscriptions WHERE user_id = :userId", { userId });
    await connection.execute("DELETE FROM users WHERE id = :userId", { userId });
    await connection.commit();

    response.json({ ok: true, message: "Cliente excluido do banco local." });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    response.status(500).json({ error: "Erro ao excluir cliente." });
  } finally {
    connection.release();
  }
});

app.get("/api/admin/contracts", requireAdminSession, async (request, response) => {
  try {
    const searchTerm = String(request.query.search || "").trim();
    const status = String(request.query.status || "").trim();
    const planId = String(request.query.planId || "").trim();
    const period = String(request.query.period || "").trim();
    const params = { search: `%${searchTerm}%` };
    const filters = [
      "(u.nome LIKE :search OR u.email LIKE :search OR u.telefone LIKE :search OR c.titulo LIKE :search)",
    ];

    if (status) {
      filters.push("c.status = :status");
      params.status = status;
    }

    if (planId) {
      filters.push("COALESCE(c.plan_id, s.plan_id) = :planId");
      params.planId = planId;
    }

    if (period === "month") {
      filters.push("COALESCE(c.data_envio, c.created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')");
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const [contracts] = await dbPool.execute(
      `SELECT
         c.id,
         c.user_id,
         c.subscription_id,
         c.plan_id,
         c.titulo,
         c.status,
         c.arquivo_url,
         c.assinatura_url,
         c.provedor,
         c.provider_contract_id,
         c.data_envio,
         c.data_assinatura,
         c.data_expiracao,
         c.observacao,
         c.created_at,
         c.updated_at,
         u.nome AS user_name,
         u.email,
         u.telefone,
         pl.nome AS plan_name,
         COALESCE(s.valor, pl.valor, 0) AS plan_value
       FROM customer_contracts c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN subscriptions s ON s.id = c.subscription_id
       LEFT JOIN plans pl ON pl.id = COALESCE(c.plan_id, s.plan_id)
       ${whereClause}
       ORDER BY COALESCE(c.data_envio, c.created_at) DESC
       LIMIT 160`,
      params,
    );

    const [summaryRows] = await dbPool.execute(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'assinado'), 0) AS signed,
         COALESCE(SUM(status IN ('pendente', 'enviado')), 0) AS pending,
         COALESCE(SUM(status = 'expirado'), 0) AS expired
       FROM customer_contracts`,
    );

    response.json({ contracts, summary: summaryRows[0] || {} });
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return response.json({
        contracts: [],
        summary: { total: 0, signed: 0, pending: 0, expired: 0 },
        warning: "Tabela customer_contracts ainda nao existe. Rode database/add-customer-contracts.sql.",
      });
    }

    console.error(error);
    response.status(500).json({ error: "Erro ao listar contratos." });
  }
});

app.get("/api/admin/contracts/template", requireAdminSession, async (_request, response) => {
  try {
    const [rows] = await dbPool.execute(
      `SELECT id, nome, conteudo, ativo, created_at, updated_at
       FROM contract_templates
       WHERE ativo = 1
       ORDER BY id ASC
       LIMIT 1`,
    );

    response.json({ template: rows[0] || null });
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return response.status(500).json({ error: "Tabela contract_templates ainda nao existe. Rode database/add-contract-admin-features.sql." });
    }

    console.error(error);
    response.status(500).json({ error: "Erro ao carregar modelo de contrato." });
  }
});

app.patch("/api/admin/contracts/template", requireAdminSession, async (request, response) => {
  try {
    const nome = String(request.body?.nome || "").trim();
    const conteudo = String(request.body?.conteudo || "").trim();

    if (!nome) return response.status(400).json({ error: "Informe o nome do modelo." });
    if (conteudo.length < 40) return response.status(400).json({ error: "O modelo precisa ter pelo menos 40 caracteres." });

    await dbPool.execute(
      `INSERT INTO contract_templates (id, nome, conteudo, ativo)
       VALUES (1, :nome, :conteudo, 1)
       ON DUPLICATE KEY UPDATE
         nome = VALUES(nome),
         conteudo = VALUES(conteudo),
         ativo = 1,
         updated_at = CURRENT_TIMESTAMP`,
      { nome, conteudo },
    );

    await logContractEvent({
      acao: "modelo_atualizado",
      status: "ok",
      mensagem: `Modelo de contrato atualizado: ${nome}`,
    });

    response.json({ ok: true, message: "Modelo de contrato salvo." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao salvar modelo de contrato." });
  }
});

app.get("/api/admin/contracts/reminders", requireAdminSession, async (_request, response) => {
  try {
    const [rows] = await dbPool.execute(
      `SELECT id, ativo, dias_primeiro_lembrete, intervalo_dias, max_lembretes, canal_email, canal_whatsapp, mensagem_padrao, updated_at
       FROM contract_reminder_settings
       ORDER BY id ASC
       LIMIT 1`,
    );

    response.json({ settings: rows[0] || null });
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return response.status(500).json({ error: "Tabela contract_reminder_settings ainda nao existe. Rode database/add-contract-admin-features.sql." });
    }

    console.error(error);
    response.status(500).json({ error: "Erro ao carregar lembretes de contrato." });
  }
});

app.patch("/api/admin/contracts/reminders", requireAdminSession, async (request, response) => {
  try {
    const ativo = request.body?.ativo === false || request.body?.ativo === "0" ? 0 : 1;
    const diasPrimeiroLembrete = Math.max(0, Number(request.body?.dias_primeiro_lembrete || 2));
    const intervaloDias = Math.max(1, Number(request.body?.intervalo_dias || 3));
    const maxLembretes = Math.max(1, Number(request.body?.max_lembretes || 3));
    const canalEmail = request.body?.canal_email === false || request.body?.canal_email === "0" ? 0 : 1;
    const canalWhatsapp = request.body?.canal_whatsapp === false || request.body?.canal_whatsapp === "0" ? 0 : 1;
    const mensagemPadrao = String(request.body?.mensagem_padrao || "").trim();

    await dbPool.execute(
      `INSERT INTO contract_reminder_settings
        (id, ativo, dias_primeiro_lembrete, intervalo_dias, max_lembretes, canal_email, canal_whatsapp, mensagem_padrao)
       VALUES
        (1, :ativo, :diasPrimeiroLembrete, :intervaloDias, :maxLembretes, :canalEmail, :canalWhatsapp, :mensagemPadrao)
       ON DUPLICATE KEY UPDATE
         ativo = VALUES(ativo),
         dias_primeiro_lembrete = VALUES(dias_primeiro_lembrete),
         intervalo_dias = VALUES(intervalo_dias),
         max_lembretes = VALUES(max_lembretes),
         canal_email = VALUES(canal_email),
         canal_whatsapp = VALUES(canal_whatsapp),
         mensagem_padrao = VALUES(mensagem_padrao),
         updated_at = CURRENT_TIMESTAMP`,
      { ativo, diasPrimeiroLembrete, intervaloDias, maxLembretes, canalEmail, canalWhatsapp, mensagemPadrao },
    );

    await logContractEvent({
      acao: "lembretes_atualizados",
      status: ativo ? "ativo" : "inativo",
      mensagem: `Lembretes: primeiro em ${diasPrimeiroLembrete} dia(s), intervalo ${intervaloDias} dia(s), maximo ${maxLembretes}.`,
    });

    response.json({ ok: true, message: "Lembretes automaticos salvos." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao salvar lembretes de contrato." });
  }
});

app.get("/api/admin/contracts/history", requireAdminSession, async (_request, response) => {
  try {
    const [events] = await dbPool.execute(
      `SELECT
         e.id,
         e.contract_id,
         e.user_id,
         e.acao,
         e.status,
         e.destino,
         e.mensagem,
         e.created_at,
         u.nome AS user_name,
         u.email,
         c.titulo AS contract_title
       FROM customer_contract_events e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN customer_contracts c ON c.id = e.contract_id
       ORDER BY e.created_at DESC
       LIMIT 120`,
    );

    response.json({ events });
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return response.status(500).json({ error: "Tabela customer_contract_events ainda nao existe. Rode database/add-contract-admin-features.sql." });
    }

    console.error(error);
    response.status(500).json({ error: "Erro ao carregar historico de contratos." });
  }
});

app.get("/api/admin/reports", requireAdminSession, async (_request, response) => {
  try {
    const [
      [summaryRows],
      [revenueRows],
      [customerRows],
      [statusRows],
      [planRows],
      [paymentActivity],
      [customerActivity],
      [contractActivity],
    ] = await Promise.all([
      dbPool.execute(
        `SELECT
           COALESCE(SUM(CASE WHEN p.status IN ('approved', 'paid', 'pago') AND COALESCE(p.data_pagamento, p.created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN p.valor ELSE 0 END), 0) AS monthlyRevenue,
           COALESCE(SUM(CASE WHEN p.status IN ('approved', 'paid', 'pago') AND YEAR(COALESCE(p.data_pagamento, p.created_at)) = YEAR(CURDATE()) THEN p.valor ELSE 0 END), 0) AS annualRevenue,
           COALESCE(SUM(p.status IN ('approved', 'paid', 'pago')), 0) AS approvedPayments,
           COUNT(*) AS totalPayments
         FROM payments p`,
      ),
      dbPool.execute(
        `SELECT
           DATE_FORMAT(COALESCE(data_pagamento, created_at), '%Y-%m') AS period,
           COALESCE(SUM(valor), 0) AS revenue
         FROM payments
         WHERE status IN ('approved', 'paid', 'pago')
           AND COALESCE(data_pagamento, created_at) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
         GROUP BY period
         ORDER BY period ASC`,
      ),
      dbPool.execute(
        `SELECT
           DATE_FORMAT(created_at, '%Y-%m') AS period,
           COUNT(*) AS total
         FROM users
         WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
         GROUP BY period
         ORDER BY period ASC`,
      ),
      dbPool.execute(
        `SELECT
           CASE
             WHEN status IN ('approved', 'paid', 'pago') THEN 'approved'
             WHEN status IN ('pending', 'in_process') THEN 'pending'
             WHEN status IN ('cancelled', 'rejected', 'refunded', 'charged_back') THEN 'cancelled'
             ELSE 'other'
           END AS status_group,
           COUNT(*) AS total
         FROM payments
         GROUP BY status_group`,
      ),
      dbPool.execute(
        `SELECT
           p.id,
           p.nome,
           p.valor,
           COALESCE(COUNT(DISTINCT CASE WHEN s.status IN ('authorized', 'active') THEN s.user_id END), 0) AS active_clients,
           COALESCE(SUM(CASE WHEN s.status IN ('authorized', 'active') THEN s.valor ELSE 0 END), 0) AS monthly_revenue
         FROM plans p
         LEFT JOIN subscriptions s ON s.plan_id = p.id
         GROUP BY p.id, p.nome, p.valor
         ORDER BY monthly_revenue DESC, active_clients DESC, p.ordem ASC`,
      ),
      dbPool.execute(
        `SELECT
           'payment' AS type,
           p.created_at AS occurred_at,
           p.status,
           p.valor,
           u.nome AS user_name,
           pl.nome AS plan_name
         FROM payments p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
         LEFT JOIN plans pl ON pl.id = s.plan_id
         ORDER BY p.created_at DESC
         LIMIT 5`,
      ),
      dbPool.execute(
        `SELECT
           'customer' AS type,
           u.created_at AS occurred_at,
           u.status,
           0 AS valor,
           u.nome AS user_name,
           pl.nome AS plan_name
         FROM users u
         LEFT JOIN subscriptions s ON s.id = (
           SELECT s2.id
           FROM subscriptions s2
           WHERE s2.user_id = u.id
           ORDER BY s2.created_at DESC
           LIMIT 1
         )
         LEFT JOIN plans pl ON pl.id = s.plan_id
         ORDER BY u.created_at DESC
         LIMIT 5`,
      ),
      dbPool.execute(
        `SELECT
           'contract' AS type,
           c.created_at AS occurred_at,
           c.status,
           0 AS valor,
           u.nome AS user_name,
           pl.nome AS plan_name
         FROM customer_contracts c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN subscriptions s ON s.id = c.subscription_id
         LEFT JOIN plans pl ON pl.id = COALESCE(c.plan_id, s.plan_id)
         ORDER BY c.created_at DESC
         LIMIT 5`,
      ),
    ]);

    const [newCustomerRows] = await dbPool.execute(
      `SELECT COUNT(*) AS newCustomers
       FROM users
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    );

    const activities = [...paymentActivity, ...customerActivity, ...contractActivity]
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      .slice(0, 6);

    response.json({
      summary: {
        ...(summaryRows[0] || {}),
        newCustomers: newCustomerRows[0]?.newCustomers || 0,
      },
      revenueMonths: revenueRows,
      customerMonths: customerRows,
      paymentStatus: statusRows,
      planPerformance: planRows,
      activities,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar relatorios." });
  }
});

app.get("/api/admin/settings", requireAdminSession, async (_request, response) => {
  try {
    await dbPool.query("SELECT 1");
    await ensureWhatsappSettingsTable();
    const hasValue = (value) => Boolean(String(value || "").trim());
    const databaseName = process.env.DB_NAME || "facilita_modern";
    const storageQuotaMb = Number(process.env.DB_STORAGE_QUOTA_MB || 10240);

    const [
      [statsRows],
      [storageRows],
      [tableRows],
    ] = await Promise.all([
      dbPool.execute(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users_count,
           (SELECT COUNT(*) FROM plans) AS plans_count,
           (SELECT COUNT(*) FROM subscriptions) AS subscriptions_count,
           (SELECT COUNT(*) FROM payments) AS payments_count,
           (SELECT COUNT(*) FROM customer_contracts) AS contracts_count`,
      ),
      dbPool.execute(
        `SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes_used
         FROM information_schema.tables
         WHERE table_schema = DATABASE()`,
      ),
      dbPool.execute(
        `SELECT COUNT(*) AS tables_count
         FROM information_schema.tables
         WHERE table_schema = DATABASE()`,
      ),
    ]);
    const whatsappSettings = await getWhatsappSettings();
    const emailSettings = await getEmailSettings();

    const stats = statsRows[0] || {};
    const bytesUsed = Number(storageRows[0]?.bytes_used || 0);
    const usedMb = bytesUsed / 1024 / 1024;
    const storagePercent = storageQuotaMb > 0 ? Math.min(100, Math.round((usedMb / storageQuotaMb) * 100)) : 0;
    const coreServicesOk = true;

    response.json({
      system: {
        version: packageJson.version || "0.1.0",
        environment: process.env.NODE_ENV || "development",
        database: "Conectado",
        databaseName,
        tablesCount: Number(tableRows[0]?.tables_count || 0),
        apiPublicUrl,
        frontendUrl,
        storage: {
          usedMb: Number(usedMb.toFixed(2)),
          quotaMb: storageQuotaMb,
          percent: storagePercent,
        },
        counts: {
          users: Number(stats.users_count || 0),
          plans: Number(stats.plans_count || 0),
          subscriptions: Number(stats.subscriptions_count || 0),
          payments: Number(stats.payments_count || 0),
          contracts: Number(stats.contracts_count || 0),
        },
        services: {
          database: coreServicesOk,
          mercadoPago: hasValue(process.env.MERCADO_PAGO_ACCESS_TOKEN) && hasValue(process.env.MERCADO_PAGO_PUBLIC_KEY),
          webhooks: hasValue(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
          email: hasValue(emailSettings.remetente_email),
        },
      },
      integrations: {
        mercadoPago: hasValue(process.env.MERCADO_PAGO_ACCESS_TOKEN) && hasValue(process.env.MERCADO_PAGO_PUBLIC_KEY),
        whatsapp:
          hasValue(whatsappSettings.suporte_numero) ||
          hasValue(whatsappSettings.atendimento_numero) ||
          hasValue(whatsappSettings.abrir_mei_numero) ||
          hasValue(whatsappSettings.plataforma_numero) ||
          hasValue(process.env.WHATSAPP_PHONE) ||
          hasValue(process.env.WHATSAPP_URL),
        email: hasValue(emailSettings.remetente_email),
        webhooks: hasValue(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
      },
      whatsapp: whatsappSettings,
      email: emailSettings,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar configuracoes." });
  }
});

let whatsappSettingsTableReady = false;

async function ensureWhatsappSettingsTable() {
  if (whatsappSettingsTableReady) return;
  await dbPool.query("SELECT id FROM whatsapp_settings LIMIT 0");
  whatsappSettingsTableReady = true;
}

async function getWhatsappSettings() {
  await ensureWhatsappSettingsTable();
  const [rows] = await dbPool.execute(
    `SELECT id, suporte_numero, atendimento_numero, abrir_mei_numero, plataforma_numero,
            lembretes_ativos, lembretes_mensagem_padrao, updated_at
     FROM whatsapp_settings
     WHERE id = 1
     LIMIT 1`,
  );

  return rows[0] || {
    id: 1,
    suporte_numero: null,
    atendimento_numero: null,
    abrir_mei_numero: null,
    plataforma_numero: null,
    lembretes_ativos: 0,
    lembretes_mensagem_padrao: null,
    updated_at: null,
  };
}

function normalizeOptionalPhone(value) {
  const digits = normalizeDigits(value || "");
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 13) {
    const error = new Error("Informe numeros de WhatsApp com DDD. Use apenas numeros.");
    error.status = 400;
    throw error;
  }
  return digits;
}

app.get("/api/admin/settings/whatsapp", requireAdminSession, async (_request, response) => {
  try {
    response.json({ settings: await getWhatsappSettings(), cloudApiConfigured: isWhatsappCloudConfigured() });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar configuracao de WhatsApp." });
  }
});

app.patch("/api/admin/settings/whatsapp", requireAdminSession, async (request, response) => {
  try {
    await ensureWhatsappSettingsTable();
    const body = request.body || {};
    const settings = {
      suporteNumero: normalizeOptionalPhone(body.suporte_numero),
      atendimentoNumero: normalizeOptionalPhone(body.atendimento_numero),
      abrirMeiNumero: normalizeOptionalPhone(body.abrir_mei_numero),
      plataformaNumero: normalizeOptionalPhone(body.plataforma_numero),
      lembretesAtivos: 0,
      mensagemPadrao: String(body.lembretes_mensagem_padrao || "").trim() || null,
    };

    await dbPool.execute(
      `INSERT INTO whatsapp_settings
        (id, suporte_numero, atendimento_numero, abrir_mei_numero, plataforma_numero, lembretes_ativos, lembretes_mensagem_padrao)
       VALUES
        (1, :suporteNumero, :atendimentoNumero, :abrirMeiNumero, :plataformaNumero, :lembretesAtivos, :mensagemPadrao)
       ON DUPLICATE KEY UPDATE
        suporte_numero = VALUES(suporte_numero),
        atendimento_numero = VALUES(atendimento_numero),
        abrir_mei_numero = VALUES(abrir_mei_numero),
        plataforma_numero = VALUES(plataforma_numero),
        lembretes_ativos = VALUES(lembretes_ativos),
        lembretes_mensagem_padrao = VALUES(lembretes_mensagem_padrao),
        updated_at = CURRENT_TIMESTAMP`,
      settings,
    );

    response.json({
      ok: true,
      message: "Configuracao de WhatsApp salva.",
      settings: await getWhatsappSettings(),
    });
  } catch (error) {
    console.error(error);
    response.status(error.status || 500).json({ error: error.message || "Erro ao salvar configuracao de WhatsApp." });
  }
});

let emailSettingsTableReady = false;

async function ensureEmailSettingsTable() {
  if (emailSettingsTableReady) return;
  await dbPool.query("SELECT id FROM email_settings LIMIT 0");
  emailSettingsTableReady = true;
}

async function getEmailSettings() {
  await ensureEmailSettingsTable();
  const [rows] = await dbPool.execute(
    `SELECT id, remetente_email, remetente_nome, smtp_host, smtp_port, smtp_secure, smtp_user,
            smtp_pass_configurado, enviar_certificados, enviar_documentos, enviar_avisos,
            assinatura_padrao, aviso_rodape, updated_at
     FROM email_settings
     WHERE id = 1
     LIMIT 1`,
  );

  const settings = rows[0] || {
    id: 1,
    remetente_email: "Atendimento@facilitameibr.com.br",
    remetente_nome: "Facilita MEI",
    smtp_host: null,
    smtp_port: null,
    smtp_secure: 1,
    smtp_user: null,
    smtp_pass_configurado: 0,
    enviar_certificados: 1,
    enviar_documentos: 1,
    enviar_avisos: 1,
    assinatura_padrao: "Atenciosamente,\nFACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA",
    aviso_rodape: "Este e-mail foi enviado pela Facilita MEI para comunicacoes relacionadas aos servicos contratados.",
    updated_at: null,
  };

  return {
    ...settings,
    smtp_pass_configurado: Number(settings.smtp_pass_configurado || 0) || (process.env.EMAIL_PASS ? 1 : 0),
    env_smtp_configurado: Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS),
  };
}

function normalizeOptionalText(value, maxLength = 160) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeEmailAddress(value, fallback = null) {
  const email = String(value || "").trim();
  if (!email) return fallback;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Informe um e-mail valido.");
    error.status = 400;
    throw error;
  }
  return email;
}

app.get("/api/admin/settings/email", requireAdminSession, async (_request, response) => {
  try {
    response.json({ settings: await getEmailSettings() });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar configuracao de e-mail." });
  }
});

app.patch("/api/admin/settings/email", requireAdminSession, async (request, response) => {
  try {
    await ensureEmailSettingsTable();
    const body = request.body || {};
    const smtpPort = body.smtp_port ? Number(body.smtp_port) : null;

    if (smtpPort !== null && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
      return response.status(400).json({ error: "Porta SMTP invalida." });
    }

    const settings = {
      remetenteEmail: normalizeEmailAddress(body.remetente_email, "Atendimento@facilitameibr.com.br"),
      remetenteNome: normalizeOptionalText(body.remetente_nome, 160) || "Facilita MEI",
      smtpHost: normalizeOptionalText(body.smtp_host, 160),
      smtpPort,
      smtpSecure: body.smtp_secure === false || body.smtp_secure === "0" ? 0 : 1,
      smtpUser: normalizeOptionalText(body.smtp_user, 160),
      smtpPassConfigurado: process.env.EMAIL_PASS ? 1 : 0,
      enviarCertificados: body.enviar_certificados === false || body.enviar_certificados === "0" ? 0 : 1,
      enviarDocumentos: body.enviar_documentos === false || body.enviar_documentos === "0" ? 0 : 1,
      enviarAvisos: body.enviar_avisos === false || body.enviar_avisos === "0" ? 0 : 1,
      assinaturaPadrao: normalizeOptionalText(body.assinatura_padrao, 2000),
      avisoRodape: normalizeOptionalText(body.aviso_rodape, 1000),
    };

    await dbPool.execute(
      `INSERT INTO email_settings
        (id, remetente_email, remetente_nome, smtp_host, smtp_port, smtp_secure, smtp_user,
         smtp_pass_configurado, enviar_certificados, enviar_documentos, enviar_avisos,
         assinatura_padrao, aviso_rodape)
       VALUES
        (1, :remetenteEmail, :remetenteNome, :smtpHost, :smtpPort, :smtpSecure, :smtpUser,
         :smtpPassConfigurado, :enviarCertificados, :enviarDocumentos, :enviarAvisos,
         :assinaturaPadrao, :avisoRodape)
       ON DUPLICATE KEY UPDATE
        remetente_email = VALUES(remetente_email),
        remetente_nome = VALUES(remetente_nome),
        smtp_host = VALUES(smtp_host),
        smtp_port = VALUES(smtp_port),
        smtp_secure = VALUES(smtp_secure),
        smtp_user = VALUES(smtp_user),
        smtp_pass_configurado = VALUES(smtp_pass_configurado),
        enviar_certificados = VALUES(enviar_certificados),
        enviar_documentos = VALUES(enviar_documentos),
        enviar_avisos = VALUES(enviar_avisos),
        assinatura_padrao = VALUES(assinatura_padrao),
        aviso_rodape = VALUES(aviso_rodape),
        updated_at = CURRENT_TIMESTAMP`,
      settings,
    );

    response.json({
      ok: true,
      message: "Configuracao de e-mail salva.",
      settings: await getEmailSettings(),
    });
  } catch (error) {
    console.error(error);
    response.status(error.status || 500).json({ error: error.message || "Erro ao salvar configuracao de e-mail." });
  }
});

let emailLogsTableReady = false;

async function ensureEmailLogsTable() {
  if (emailLogsTableReady) return;
  await dbPool.query("SELECT id FROM email_logs LIMIT 0");
  emailLogsTableReady = true;
}

function escapeEmailHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoneyBR(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getSmtpConfig(settings) {
  const host = process.env.EMAIL_HOST || settings.smtp_host;
  const port = Number(process.env.EMAIL_PORT || settings.smtp_port || 587);
  const user = process.env.EMAIL_USER || settings.smtp_user;
  const pass = process.env.EMAIL_PASS;
  const secure =
    process.env.EMAIL_SECURE !== undefined
      ? ["1", "true", "yes"].includes(String(process.env.EMAIL_SECURE).toLowerCase())
      : Boolean(Number(settings.smtp_secure || 0));

  return { host, port, user, pass, secure };
}

async function marcarEmailLogErro(dedupeKey, erroMensagem) {
  await ensureEmailLogsTable();
  await dbPool.execute(
    `UPDATE email_logs
     SET status = 'erro',
         erro_mensagem = :erroMensagem,
         updated_at = CURRENT_TIMESTAMP
     WHERE dedupe_key = :dedupeKey`,
    { dedupeKey, erroMensagem: String(erroMensagem || "Erro ao enviar e-mail.").slice(0, 1200) },
  );
}

async function enviarEmailSistema({ dedupeKey, tipo, userId = null, subscriptionId = null, paymentId = null, to, subject, text, html }) {
  if (!to || !String(to).includes("@")) return { sent: false, reason: "destinatario_invalido" };

  await ensureEmailLogsTable();

  await dbPool.execute(
    `INSERT INTO email_logs
      (dedupe_key, user_id, subscription_id, payment_id, tipo, destinatario, assunto, status)
     VALUES
      (:dedupeKey, :userId, :subscriptionId, :paymentId, :tipo, :to, :subject, 'preparando')
     ON DUPLICATE KEY UPDATE
      destinatario = VALUES(destinatario),
      assunto = VALUES(assunto),
      updated_at = CURRENT_TIMESTAMP`,
    { dedupeKey, userId, subscriptionId, paymentId, tipo, to, subject },
  );

  const [logRows] = await dbPool.execute("SELECT status FROM email_logs WHERE dedupe_key = :dedupeKey LIMIT 1", {
    dedupeKey,
  });
  if (logRows[0]?.status === "enviado") return { sent: false, reason: "email_ja_enviado" };

  const settings = await getEmailSettings();
  const smtp = getSmtpConfig(settings);

  if (!smtp.host || !smtp.user || !smtp.pass) {
    await marcarEmailLogErro(
      dedupeKey,
      "SMTP incompleto. Configure EMAIL_HOST, EMAIL_USER e EMAIL_PASS no Railway.",
    );
    return { sent: false, reason: "smtp_incompleto" };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    const result = await transporter.sendMail({
      from: `"${settings.remetente_nome || "Facilita MEI"}" <${settings.remetente_email || "Atendimento@facilitameibr.com.br"}>`,
      to,
      subject,
      text,
      html,
    });

    await dbPool.execute(
      `UPDATE email_logs
       SET status = 'enviado',
           provider_message_id = :messageId,
           erro_mensagem = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE dedupe_key = :dedupeKey`,
      { dedupeKey, messageId: result.messageId || null },
    );

    return { sent: true, messageId: result.messageId || null };
  } catch (error) {
    await marcarEmailLogErro(dedupeKey, error.message || "Erro ao enviar e-mail.");
    console.error("Erro ao enviar e-mail automatico:", error);
    return { sent: false, reason: "erro_envio", error: error.message };
  }
}

async function buscarDadosAssinaturaParaEmail(subscriptionId) {
  const [rows] = await dbPool.execute(
    `SELECT
       s.id AS subscription_id,
       s.status AS subscription_status,
       s.valor AS subscription_value,
       s.metodo_pagamento,
       s.data_inicio,
       s.data_proxima_cobranca,
       u.id AS user_id,
       u.nome AS user_name,
       u.email,
       u.telefone,
       p.id AS plan_id,
       p.nome AS plan_name,
       p.descricao AS plan_description,
       p.valor AS plan_value
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.id = :subscriptionId
     LIMIT 1`,
    { subscriptionId },
  );

  return rows[0] || null;
}

function montarHtmlAssinatura({ nome, plano, valor, status, proximaCobranca, assinatura, avisoRodape }) {
  return `
    <div style="font-family:Arial,sans-serif;background:#080806;color:#fff8e8;padding:28px">
      <div style="max-width:640px;margin:0 auto;border:1px solid #7a5a18;border-radius:16px;padding:28px;background:#14110b">
        <h1 style="margin:0 0 12px;color:#ffd66b">Assinatura recebida</h1>
        <p>Ola, <strong>${escapeEmailHtml(nome)}</strong>.</p>
        <p>Sua assinatura na Facilita MEI foi registrada com sucesso.</p>
        <div style="margin:22px 0;padding:18px;border-radius:12px;background:#211a10;border:1px solid #5f4615">
          <p><strong>Plano:</strong> ${escapeEmailHtml(plano)}</p>
          <p><strong>Valor:</strong> ${escapeEmailHtml(valor)}</p>
          <p><strong>Status:</strong> ${escapeEmailHtml(status)}</p>
          <p><strong>Proxima cobranca:</strong> ${escapeEmailHtml(proximaCobranca)}</p>
        </div>
        <p>Nossa equipe acompanhara seu cadastro e os proximos passos do atendimento.</p>
        <p style="white-space:pre-line">${escapeEmailHtml(assinatura || "")}</p>
        <p style="font-size:12px;color:#c8b98c">${escapeEmailHtml(avisoRodape || "")}</p>
      </div>
    </div>
  `;
}

async function enviarEmailAssinaturaCriada(subscriptionId) {
  const dados = await buscarDadosAssinaturaParaEmail(subscriptionId);
  if (!dados?.email) return { sent: false, reason: "assinatura_sem_email" };

  const settings = await getEmailSettings();
  if (!Number(settings.enviar_avisos)) return { sent: false, reason: "avisos_desativados" };

  const nome = dados.user_name || "cliente";
  const plano = dados.plan_name || dados.plan_id || "Plano Facilita MEI";
  const valor = formatMoneyBR(dados.subscription_value || dados.plan_value);
  const proximaCobranca = dados.data_proxima_cobranca
    ? new Date(dados.data_proxima_cobranca).toLocaleDateString("pt-BR")
    : "Aguardando confirmacao";
  const status = dados.subscription_status || "pending";
  const subject = "Sua assinatura Facilita MEI foi recebida";
  const text = [
    `Ola, ${nome}.`,
    "",
    "Sua assinatura na Facilita MEI foi registrada com sucesso.",
    "",
    `Plano: ${plano}`,
    `Valor: ${valor}`,
    `Status: ${status}`,
    `Proxima cobranca: ${proximaCobranca}`,
    "",
    "Nossa equipe acompanhara seu cadastro e os proximos passos do atendimento.",
    "",
    settings.assinatura_padrao || "Atenciosamente,\nFACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA",
    "",
    settings.aviso_rodape || "",
  ].join("\n");

  return enviarEmailSistema({
    dedupeKey: `assinatura-criada:${subscriptionId}`,
    tipo: "assinatura_criada",
    userId: dados.user_id,
    subscriptionId,
    to: dados.email,
    subject,
    text,
    html: montarHtmlAssinatura({
      nome,
      plano,
      valor,
      status,
      proximaCobranca,
      assinatura: settings.assinatura_padrao,
      avisoRodape: settings.aviso_rodape,
    }),
  });
}

async function buscarDadosPagamentoParaEmail(paymentId) {
  const [rows] = await dbPool.execute(
    `SELECT
       pay.id AS payment_id,
       pay.status AS payment_status,
       pay.valor AS payment_value,
       pay.data_pagamento,
       pay.gateway_payment_id,
       s.id AS subscription_id,
       s.status AS subscription_status,
       s.data_proxima_cobranca,
       u.id AS user_id,
       u.nome AS user_name,
       u.email,
       p.id AS plan_id,
       p.nome AS plan_name,
       p.valor AS plan_value
     FROM payments pay
     LEFT JOIN subscriptions s ON s.id = pay.subscription_id
     LEFT JOIN users u ON u.id = pay.user_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE pay.id = :paymentId
     LIMIT 1`,
    { paymentId },
  );

  return rows[0] || null;
}

async function enviarEmailPagamentoAprovado(paymentId) {
  const dados = await buscarDadosPagamentoParaEmail(paymentId);
  if (!dados?.email || dados.payment_status !== "approved") return { sent: false, reason: "pagamento_nao_aprovado" };

  const settings = await getEmailSettings();
  if (!Number(settings.enviar_avisos)) return { sent: false, reason: "avisos_desativados" };

  const nome = dados.user_name || "cliente";
  const plano = dados.plan_name || dados.plan_id || "Plano Facilita MEI";
  const valor = formatMoneyBR(dados.payment_value || dados.plan_value);
  const dataPagamento = dados.data_pagamento
    ? new Date(dados.data_pagamento).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");
  const subject = "Pagamento aprovado - Facilita MEI";
  const text = [
    `Ola, ${nome}.`,
    "",
    "Recebemos a confirmacao do seu pagamento.",
    "",
    `Plano: ${plano}`,
    `Valor: ${valor}`,
    `Data do pagamento: ${dataPagamento}`,
    dados.gateway_payment_id ? `ID do pagamento: ${dados.gateway_payment_id}` : "",
    "",
    "Seu atendimento continuara normalmente pela equipe Facilita MEI.",
    "",
    settings.assinatura_padrao || "Atenciosamente,\nFACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA",
    "",
    settings.aviso_rodape || "",
  ].filter(Boolean).join("\n");

  return enviarEmailSistema({
    dedupeKey: `pagamento-aprovado:${paymentId}`,
    tipo: "pagamento_aprovado",
    userId: dados.user_id,
    subscriptionId: dados.subscription_id,
    paymentId,
    to: dados.email,
    subject,
    text,
    html: montarHtmlAssinatura({
      nome,
      plano,
      valor,
      status: "Pagamento aprovado",
      proximaCobranca: dados.data_proxima_cobranca
        ? new Date(dados.data_proxima_cobranca).toLocaleDateString("pt-BR")
        : "Conforme ciclo do plano",
      assinatura: settings.assinatura_padrao,
      avisoRodape: settings.aviso_rodape,
    }),
  });
}

app.get("/api/admin/settings/export-data", requireAdminSession, async (_request, response) => {
  try {
    const [
      [users],
      [plans],
      [subscriptions],
      [payments],
      [contracts],
    ] = await Promise.all([
      dbPool.execute(
        `SELECT id, nome, email, telefone, documento, status, cliente_login_ativo, created_at, updated_at
         FROM users
         ORDER BY id ASC`,
      ),
      dbPool.execute(
        `SELECT id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca, ativo, ordem, created_at, updated_at
         FROM plans
         ORDER BY ordem ASC, id ASC`,
      ),
      dbPool.execute(
        `SELECT id, user_id, plan_id, mercado_pago_subscription_id, status, valor, metodo_pagamento, data_inicio, data_proxima_cobranca, created_at, updated_at
         FROM subscriptions
         ORDER BY id ASC`,
      ),
      dbPool.execute(
        `SELECT id, user_id, subscription_id, mercado_pago_payment_id, valor, status, data_pagamento, created_at
         FROM payments
         ORDER BY id ASC`,
      ),
      dbPool.execute(
        `SELECT id, user_id, subscription_id, plan_id, titulo, status, arquivo_url, assinatura_url, provedor, provider_contract_id, data_envio, data_assinatura, data_expiracao, observacao, created_at, updated_at
         FROM customer_contracts
         ORDER BY id ASC`,
      ),
    ]);

    response.json({
      generatedAt: new Date().toISOString(),
      database: process.env.DB_NAME || "facilita_modern",
      users,
      plans,
      subscriptions,
      payments,
      contracts,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao exportar dados do banco." });
  }
});

app.post("/api/admin/settings/backup", requireAdminSession, async (_request, response) => {
  try {
    const [summaryRows] = await dbPool.execute(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM plans) AS plans,
         (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
         (SELECT COUNT(*) FROM payments) AS payments,
         (SELECT COUNT(*) FROM customer_contracts) AS contracts`,
    );

    response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filename: `backup-facilita-${new Date().toISOString().slice(0, 10)}.json`,
      summary: summaryRows[0] || {},
      message: "Backup logico preparado com dados reais do banco.",
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao preparar backup." });
  }
});

app.post("/api/admin/settings/clear-cache", requireAdminSession, async (_request, response) => {
  response.json({
    ok: true,
    clearedAt: new Date().toISOString(),
    message: "Cache administrativo limpo. Os proximos dados serao carregados direto do banco.",
  });
});

app.get("/api/admin/notifications", requireAdminSession, async (_request, response) => {
  try {
    const [items] = await dbPool.execute(
      `SELECT *
       FROM (
         SELECT
           'cliente' AS type,
           u.id AS ref_id,
           'Novo cliente cadastrado' AS title,
           CONCAT(u.nome, ' entrou no sistema.') AS detail,
           u.created_at AS created_at,
           'info' AS severity
         FROM users u
         WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)

         UNION ALL

         SELECT
           'pagamento' AS type,
           p.id AS ref_id,
           CASE
             WHEN p.status IN ('approved', 'paid', 'pago') THEN 'Pagamento aprovado'
             WHEN p.status IN ('pending', 'in_process') THEN 'Pagamento pendente'
             ELSE 'Atualizacao de pagamento'
           END AS title,
           CONCAT(COALESCE(u.nome, 'Cliente'), ' - R$ ', FORMAT(p.valor, 2, 'de_DE'), ' - ', p.status) AS detail,
           COALESCE(p.data_pagamento, p.created_at) AS created_at,
           CASE
             WHEN p.status IN ('approved', 'paid', 'pago') THEN 'success'
             WHEN p.status IN ('pending', 'in_process') THEN 'warning'
             ELSE 'danger'
           END AS severity
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            OR p.status IN ('pending', 'in_process')

         UNION ALL

         SELECT
           'contrato' AS type,
           c.id AS ref_id,
           CASE
             WHEN c.status = 'assinado' THEN 'Contrato assinado'
             WHEN c.status = 'expirado' THEN 'Contrato expirado'
             ELSE 'Contrato pendente'
           END AS title,
           CONCAT(COALESCE(u.nome, 'Cliente'), ' - ', c.status) AS detail,
           COALESCE(c.data_assinatura, c.data_envio, c.updated_at, c.created_at) AS created_at,
           CASE
             WHEN c.status = 'assinado' THEN 'success'
             WHEN c.status = 'expirado' THEN 'danger'
             ELSE 'warning'
           END AS severity
         FROM customer_contracts c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            OR c.status IN ('pendente', 'enviado', 'expirado')

         UNION ALL

         SELECT
           'sistema' AS type,
           e.id AS ref_id,
           'Evento de contrato' AS title,
           COALESCE(e.mensagem, e.acao) AS detail,
           e.created_at AS created_at,
           CASE WHEN e.status IN ('erro', 'falha') THEN 'danger' ELSE 'info' END AS severity
         FROM customer_contract_events e
         WHERE e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ) notifications
       ORDER BY created_at DESC
       LIMIT 40`,
    );

    const [countRows] = await dbPool.execute(
      `SELECT
         (
           (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) +
           (SELECT COUNT(*) FROM payments WHERE status IN ('pending', 'in_process')) +
           (SELECT COUNT(*) FROM customer_contracts WHERE status IN ('pendente', 'enviado', 'expirado')) +
           (SELECT COUNT(*) FROM customer_contract_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY))
         ) AS total`,
    );

    response.json({
      count: Number(countRows[0]?.total || 0),
      items,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar notificacoes." });
  }
});

app.post("/api/admin/contracts/generate-bulk", requireAdminSession, async (_request, response) => {
  try {
    const [result] = await dbPool.execute(
      `INSERT INTO customer_contracts
         (user_id, subscription_id, plan_id, titulo, status, data_envio, observacao)
       SELECT
         s.user_id,
         s.id,
         s.plan_id,
         CONCAT('Contrato de Prestacao de Servicos - ', COALESCE(p.nome, s.plan_id)),
         'enviado',
         NOW(),
         'Contrato gerado em massa pelo painel administrativo.'
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN customer_contracts c ON c.subscription_id = s.id
       WHERE c.id IS NULL
         AND s.status IN ('authorized', 'active')
       ORDER BY s.created_at DESC`,
    );

    await logContractEvent({
      acao: "envio_massa",
      status: "ok",
      mensagem: result.affectedRows
        ? `${result.affectedRows} contrato(s) gerado(s) em massa.`
        : "Envio em massa executado sem novos contratos para gerar.",
    });

    response.status(201).json({
      ok: true,
      created: result.affectedRows || 0,
      message: result.affectedRows
        ? `${result.affectedRows} contrato(s) gerado(s) no banco.`
        : "Nenhuma assinatura ativa sem contrato foi encontrada.",
    });
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return response.status(500).json({ error: "Tabela customer_contracts ainda nao existe. Rode database/add-customer-contracts.sql." });
    }

    console.error(error);
    response.status(500).json({ error: "Erro ao gerar contratos em massa." });
  }
});

app.post("/api/admin/contracts/:id/send", requireAdminSession, async (request, response) => {
  try {
    const contractId = Number(request.params.id);
    const [[contract]] = await dbPool.execute(
      `SELECT c.id, c.user_id, u.email
       FROM customer_contracts c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = :contractId
       LIMIT 1`,
      { contractId },
    );

    if (!contract) return response.status(404).json({ error: "Contrato nao encontrado." });

    const [result] = await dbPool.execute(
      `UPDATE customer_contracts
       SET status = CASE
             WHEN status = 'assinado' THEN status
             ELSE 'enviado'
           END,
           data_envio = CASE
             WHEN data_envio IS NULL THEN NOW()
             ELSE data_envio
           END,
           observacao = CASE
             WHEN status = 'assinado' THEN observacao
             ELSE 'Contrato reenviado pelo painel administrativo.'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :contractId`,
      { contractId },
    );

    if (!result.affectedRows) return response.status(404).json({ error: "Contrato nao encontrado." });
    await logContractEvent({
      contractId,
      userId: contract.user_id,
      acao: "contrato_reenviado",
      status: "ok",
      destino: contract.email || null,
      mensagem: "Contrato marcado como enviado pelo painel administrativo.",
    });

    response.json({ ok: true, message: "Contrato marcado como enviado." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao reenviar contrato." });
  }
});

app.get("/api/admin/plans", requireAdminSession, async (_request, response) => {
  try {
    const [plans] = await dbPool.execute(
      `SELECT
         p.id,
         p.nome,
         p.descricao,
         p.valor,
         p.frequencia,
         p.tipo_frequencia,
         p.servico,
         p.mercado_pago_plan_id,
         p.tipo_cobranca,
         p.ativo,
         p.ordem,
         p.created_at,
         p.updated_at,
         COUNT(DISTINCT CASE WHEN s.status IN ('active', 'authorized') THEN s.user_id END) AS active_clients,
         COUNT(DISTINCT s.user_id) AS total_clients,
         COALESCE(SUM(CASE WHEN s.status IN ('active', 'authorized') THEN s.valor ELSE 0 END), 0) AS monthly_revenue
       FROM plans p
       LEFT JOIN subscriptions s ON s.plan_id = p.id
       GROUP BY
         p.id,
         p.nome,
         p.descricao,
         p.valor,
         p.frequencia,
         p.tipo_frequencia,
         p.servico,
         p.mercado_pago_plan_id,
         p.tipo_cobranca,
         p.ativo,
         p.ordem,
         p.created_at,
         p.updated_at
       ORDER BY p.ordem ASC, p.nome ASC`,
    );

    let featureRows = [];

    try {
      const [rows] = await dbPool.execute(
        `SELECT plan_id, descricao, ordem, ativo
         FROM plan_features
         WHERE ativo = 1
         ORDER BY plan_id ASC, ordem ASC, id ASC`,
      );
      featureRows = rows;
    } catch (featuresError) {
      if (featuresError.code !== "ER_NO_SUCH_TABLE") throw featuresError;
      console.warn("Tabela plan_features ainda nao existe. Retornando planos sem itens inclusos.");
    }

    const featuresByPlan = featureRows.reduce((acc, feature) => {
      if (!acc[feature.plan_id]) acc[feature.plan_id] = [];
      acc[feature.plan_id].push({
        descricao: feature.descricao,
        ordem: feature.ordem,
      });
      return acc;
    }, {});

    plans.forEach((plan) => {
      plan.features = featuresByPlan[plan.id] || [];
    });

    response.json({ plans });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao listar planos." });
  }
});

app.post("/api/admin/plans", requireAdminSession, async (request, response) => {
  try {
    const body = request.body || {};
    const planId = String(body.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const nome = String(body.nome || "").trim();
    const valor = Number(body.valor || 0);

    if (!planId || !nome || !Number.isFinite(valor) || valor <= 0) {
      return response.status(400).json({ error: "Informe ID, nome e valor valido para criar o plano." });
    }

    await dbPool.execute(
      `INSERT INTO plans
        (id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca, ativo, ordem)
       VALUES
        (:planId, :nome, :descricao, :valor, :frequencia, :tipoFrequencia, :servico, :mercadoPagoPlanId, :tipoCobranca, :ativo, :ordem)`,
      {
        planId,
        nome,
        descricao: String(body.descricao || "").trim(),
        valor,
        frequencia: Number(body.frequencia || 1),
        tipoFrequencia: body.tipo_frequencia === "days" ? "days" : "months",
        servico: String(body.servico || planId).trim(),
        mercadoPagoPlanId: String(body.mercado_pago_plan_id || "").trim() || null,
        tipoCobranca: body.tipo_cobranca === "single" ? "single" : "subscription",
        ativo: body.ativo === false || body.ativo === "0" ? 0 : 1,
        ordem: Number(body.ordem || 0),
      },
    );

    response.status(201).json({ ok: true, plan: { id: planId, nome, valor } });
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
      return response.status(409).json({ error: "Ja existe um plano com esse ID." });
    }
    response.status(500).json({ error: "Erro ao criar plano." });
  }
});

app.patch("/api/admin/plans/:id", requireAdminSession, async (request, response) => {
  try {
    const planId = request.params.id;
    const body = request.body || {};

    await dbPool.execute(
      `UPDATE plans
       SET nome = :nome,
           descricao = :descricao,
           valor = :valor,
           frequencia = :frequencia,
           tipo_frequencia = :tipoFrequencia,
           servico = :servico,
           tipo_cobranca = :tipoCobranca,
           ativo = :ativo,
           ordem = :ordem,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :planId`,
      {
        planId,
        nome: String(body.nome || "").trim(),
        descricao: String(body.descricao || "").trim(),
        valor: Number(body.valor || 0),
        frequencia: Number(body.frequencia || 1),
        tipoFrequencia: body.tipo_frequencia === "days" ? "days" : "months",
        servico: String(body.servico || "").trim(),
        tipoCobranca: body.tipo_cobranca === "single" ? "single" : "subscription",
        ativo: body.ativo ? 1 : 0,
        ordem: Number(body.ordem || 0),
      },
    );

    response.json({ ok: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao salvar plano." });
  }
});

app.get("/api/admin/payments", requireAdminSession, async (request, response) => {
  try {
    const status = String(request.query.status || "").trim();
    const params = {};
    let statusFilter = "";

    if (status) {
      const statusGroups = {
        paid: ["approved", "paid", "pago"],
        pending: ["pending", "in_process"],
        cancelled: ["cancelled", "rejected", "refunded", "charged_back"],
      };
      const statuses = statusGroups[status] || [status];
      statusFilter = `WHERE p.status IN (${statuses.map((_, index) => `:status${index}`).join(", ")})`;
      statuses.forEach((item, index) => {
        params[`status${index}`] = item;
      });
    }

    const [payments] = await dbPool.execute(
      `SELECT
         p.*,
         u.nome AS user_name,
         u.email,
         COALESCE(pl.nome, subscription_plan.nome) AS plan_name
       FROM payments p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN subscriptions s ON s.id = p.subscription_id
       LEFT JOIN plans pl ON pl.id = p.plan_id
       LEFT JOIN plans subscription_plan ON subscription_plan.id = s.plan_id
       ${statusFilter}
       ORDER BY p.created_at DESC
       LIMIT 160`,
      params,
    );

    const [summaryRows] = await dbPool.execute(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status IN ('approved', 'paid', 'pago') AND YEAR(COALESCE(data_pagamento, created_at)) = YEAR(CURDATE()) THEN valor ELSE 0 END), 0) AS approvedAmount,
         COALESCE(SUM(CASE WHEN status IN ('approved', 'paid', 'pago') AND COALESCE(data_pagamento, created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN valor ELSE 0 END), 0) AS monthlyApprovedAmount,
         COALESCE(SUM(CASE WHEN status IN ('pending', 'in_process') THEN valor ELSE 0 END), 0) AS pendingAmount,
         SUM(status IN ('approved', 'paid', 'pago')) AS approved,
         SUM(status IN ('pending', 'in_process')) AS pending,
         SUM(status IN ('cancelled', 'rejected', 'refunded', 'charged_back')) AS cancelled
       FROM payments`,
    );

    response.json({ payments, summary: summaryRows[0] || {} });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao listar pagamentos." });
  }
});

app.patch("/api/admin/subscriptions/:id", requireAdminSession, async (request, response) => {
  try {
    const subscriptionId = Number(request.params.id);
    const { status, planId } = request.body || {};
    const allowedStatuses = ["pending", "authorized", "active", "paused", "cancelled", "expired", "rejected"];
    const updates = [];
    const params = { subscriptionId };

    if (allowedStatuses.includes(status)) {
      updates.push("status = :status");
      params.status = status;
    }

    if (planId) {
      const plan = await getPlanById(planId);
      if (!plan) return response.status(400).json({ error: "Plano invalido." });
      updates.push("plan_id = :planId", "valor = :valor");
      params.planId = plan.id;
      params.valor = plan.price;
    }

    if (!updates.length) return response.status(400).json({ error: "Nenhuma alteracao enviada." });

    await dbPool.execute(
      `UPDATE subscriptions
       SET ${updates.join(", ")},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :subscriptionId`,
      params,
    );

    const [rows] = await dbPool.execute("SELECT user_id, status FROM subscriptions WHERE id = :subscriptionId", {
      subscriptionId,
    });
    await updateUserStatusFromSubscription(rows[0]?.user_id, rows[0]?.status);

    response.json({ ok: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao atualizar assinatura." });
  }
});

app.post("/api/admin/customers/:id/subscriptions", requireAdminSession, async (request, response) => {
  try {
    const userId = Number(request.params.id);
    const { planId, status } = request.body || {};
    const allowedStatuses = ["pending", "authorized", "active", "paused", "cancelled", "expired", "rejected"];
    const subscriptionStatus = allowedStatuses.includes(status) ? status : "active";

    if (!userId) return response.status(400).json({ error: "Cliente invalido." });
    if (!planId) return response.status(400).json({ error: "Selecione um plano para vincular." });

    const [[customer]] = await dbPool.execute("SELECT id FROM users WHERE id = :userId LIMIT 1", { userId });
    if (!customer) return response.status(404).json({ error: "Cliente nao encontrado." });

    const plan = await getPlanById(planId);
    if (!plan) return response.status(400).json({ error: "Plano invalido ou inativo." });

    const now = new Date();
    const nextCharge = new Date(now);
    nextCharge.setMonth(nextCharge.getMonth() + 1);
    const localSubscriptionRef = `admin-local-${userId}-${Date.now()}-${crypto.randomUUID()}`;

    const [result] = await dbPool.execute(
      `INSERT INTO subscriptions
        (user_id, plan_id, mercado_pago_subscription_id, status, valor, data_inicio, data_proxima_cobranca, metodo_pagamento, raw_payload)
       VALUES
        (:userId, :planId, :subscriptionRef, :status, :valor, :startAt, :nextChargeAt, 'manual_admin', :rawPayload)`,
      {
        userId,
        planId: plan.id,
        subscriptionRef: localSubscriptionRef,
        status: subscriptionStatus,
        valor: plan.price,
        startAt: now,
        nextChargeAt: nextCharge,
        rawPayload: JSON.stringify({
          origem: "admin_manual",
          plan_id: plan.id,
          plan_name: plan.name,
          created_by: "admin",
        }),
      },
    );

    await updateUserStatusFromSubscription(userId, subscriptionStatus);

    response.status(201).json({ ok: true, subscriptionId: result.insertId });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao vincular plano ao cliente." });
  }
});

app.post("/api/admin/customers/:id/payments/:method", requireAdminSession, async (request, response) => {
  try {
    const userId = Number(request.params.id);
    const method = String(request.params.method || "").toLowerCase();
    const { planId, endereco, address, dueDate } = request.body || {};

    if (!Number.isFinite(userId) || userId <= 0) {
      return response.status(400).json({ error: "Cliente invalido." });
    }

    if (!["pix", "boleto"].includes(method)) {
      return response.status(400).json({ error: "Metodo de pagamento invalido." });
    }

    const [customerRows] = await dbPool.execute(
      `SELECT id, nome, email, telefone, whatsapp, documento, cnpj, cep, logradouro, numero, bairro, municipio, uf
       FROM users
       WHERE id = :userId
       LIMIT 1`,
      { userId },
    );
    const customer = customerRows[0];

    if (!customer) return response.status(404).json({ error: "Cliente nao encontrado." });

    let selectedPlanId = planId;
    if (!selectedPlanId) {
      const [subscriptionRows] = await dbPool.execute(
        `SELECT plan_id
         FROM subscriptions
         WHERE user_id = :userId
         ORDER BY created_at DESC
         LIMIT 1`,
        { userId },
      );
      selectedPlanId = subscriptionRows[0]?.plan_id;
    }

    if (!selectedPlanId) {
      return response.status(400).json({ error: "Selecione ou vincule um plano antes de gerar cobranca." });
    }

    const plan = await getPlanById(selectedPlanId);
    if (!plan) return response.status(400).json({ error: "Plano invalido ou inativo." });

    const payment = await createMercadoPagoSinglePayment({
      customerId: userId,
      customer,
      plan,
      paymentMethod: method,
      address: endereco || address || {},
      dueDate,
    });

    response.status(201).json({ ok: true, payment });
  } catch (error) {
    console.error(`Erro ao gerar cobranca administrativa:`, error);
    response.status(error.status || 500).json({
      error: error.message || "Erro ao gerar cobranca.",
      details: error.details,
    });
  }
});

app.post("/api/admin/subscriptions/:id/cancel", requireAdminSession, async (request, response) => {
  try {
    const subscriptionId = Number(request.params.id);
    const [rows] = await dbPool.execute(
      `SELECT id, user_id, mercado_pago_subscription_id
       FROM subscriptions
       WHERE id = :subscriptionId
       LIMIT 1`,
      { subscriptionId },
    );
    const subscription = rows[0];

    if (!subscription) return response.status(404).json({ error: "Assinatura nao encontrada." });

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (accessToken && subscription.mercado_pago_subscription_id) {
      await fetch(`https://api.mercadopago.com/preapproval/${subscription.mercado_pago_subscription_id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
    }

    await dbPool.execute(
      `UPDATE subscriptions
       SET status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :subscriptionId`,
      { subscriptionId },
    );
    await updateUserStatus(subscription.user_id, "cancelled");

    response.json({ ok: true, message: "Assinatura cancelada." });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao cancelar assinatura." });
  }
});

app.post("/api/admin/plans/:planId/mercado-pago-plan", requireAdminKey, async (request, response) => {
  try {
    const { planId } = request.params;
    const plan = await getPlanById(planId);

    if (!plan) {
      return response.status(404).json({ error: "Plano nao encontrado ou inativo." });
    }

    ensureSubscriptionPlan(plan);

    if (plan.mercadoPagoPlanId) {
      return response.json({
        planId: plan.id,
        mercadoPagoPlanId: plan.mercadoPagoPlanId,
        message: "Plano ja possui mercado_pago_plan_id cadastrado.",
      });
    }

    const data = await createMercadoPagoPlan(plan);

    response.json({
      planId: plan.id,
      mercadoPagoPlanId: data.id,
      status: data.status,
      message: "Plano criado no Mercado Pago e salvo no banco.",
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao sincronizar plano Mercado Pago." });
  }
});

app.post("/api/admin/plans/mercado-pago/sync", requireAdminKey, async (_request, response) => {
  try {
    const accessToken = getAccessTokenOrThrow();
    const plans = await getActiveSubscriptionPlans();
    const results = [];

    for (const plan of plans) {
      if (plan.mercadoPagoPlanId) {
        results.push({
          planId: plan.id,
          mercadoPagoPlanId: plan.mercadoPagoPlanId,
          status: "skipped",
          message: "Plano ja possui mercado_pago_plan_id.",
        });
        continue;
      }

      try {
        const data = await createMercadoPagoPlan(plan, accessToken);
        results.push({
          planId: plan.id,
          mercadoPagoPlanId: data.id,
          status: "created",
        });
      } catch (error) {
        results.push({
          planId: plan.id,
          status: "error",
          error: error.message,
          details: error.details,
        });
      }
    }

    response.json({ results });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao sincronizar planos Mercado Pago." });
  }
});

function normalizeDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function hasRepeatedDigits(value = "") {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(documentNumber = "") {
  const cpf = normalizeDigits(documentNumber);
  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;

  return digit === Number(cpf[10]);
}

function isValidCnpj(documentNumber = "") {
  const cnpj = normalizeDigits(documentNumber);
  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) return false;

  const validateDigit = (base, weights) => {
    const sum = weights.reduce((total, weight, index) => total + Number(base[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const firstDigit = validateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = validateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13]);
}

function isValidCpfOrCnpj(documentNumber = "") {
  const digits = normalizeDigits(documentNumber);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

function getMercadoPagoPaymentError(data, fallbackMessage) {
  const message = String(data?.message || "");
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid user identification number")) {
    return "Informe um CPF ou CNPJ valido para gerar o pagamento.";
  }

  if (normalizedMessage.includes("collector user without key enabled for qr render")) {
    return "Pix ainda nao esta habilitado na conta Mercado Pago recebedora. Cadastre uma chave Pix na conta do Mercado Pago e tente novamente.";
  }

  if (normalizedMessage.includes("unauthorized use of live credentials")) {
    return "Credenciais de producao do Mercado Pago sem permissao para criar pagamentos. Confira se o Access Token pertence a aplicacao correta e tem permissao de pagamentos.";
  }

  return data?.message || fallbackMessage;
}

function normalizeBoletoAddress(address = {}) {
  return {
    zipCode: normalizeDigits(address.cep || address.zipCode || address.zip_code || ""),
    streetName: cleanText(address.logradouro || address.streetName || address.street_name || "", 120),
    streetNumber: cleanText(address.numero || address.streetNumber || address.street_number || "", 24),
    neighborhood: cleanText(address.bairro || address.neighborhood || "", 80),
    city: cleanText(address.cidade || address.city || "", 80),
    federalUnit: cleanText(address.uf || address.federalUnit || address.federal_unit || "", 2)?.toUpperCase() || "",
  };
}

function validateBoletoAddress(address = {}) {
  const normalizedAddress = normalizeBoletoAddress(address);
  const missingFields = [];

  if (normalizedAddress.zipCode.length !== 8) missingFields.push("CEP");
  if (!normalizedAddress.streetName) missingFields.push("rua");
  if (!normalizedAddress.streetNumber) missingFields.push("numero");
  if (!normalizedAddress.neighborhood) missingFields.push("bairro");
  if (!normalizedAddress.city) missingFields.push("cidade");
  if (!/^[A-Z]{2}$/.test(normalizedAddress.federalUnit)) missingFields.push("UF");

  return { normalizedAddress, missingFields };
}

function getSaoPauloDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function addCalendarDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function getBoletoExpirationDate(requestedDate, now = new Date()) {
  const today = getSaoPauloDateString(now);
  const selectedDate = String(requestedDate || addCalendarDays(today, 3)).trim();
  const minimumDate = addCalendarDays(today, 1);
  const maximumDate = addCalendarDays(today, 30);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || selectedDate < minimumDate || selectedDate > maximumDate) {
    throw Object.assign(new Error("Escolha o vencimento do boleto entre 1 e 30 dias a partir de hoje."), { status: 400 });
  }
  return `${selectedDate}T23:59:59.000-03:00`;
}

function formatBoletoDueDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
}

async function sendAutomaticBoletoWhatsapp({ paymentId, recipient, customerName, amount, dueDate, paymentLink }) {
  if (!isWhatsappCloudConfigured()) return { status: "not_configured", sent: false };
  const [claim] = await dbPool.execute(
    `INSERT IGNORE INTO boleto_whatsapp_deliveries
      (gateway_payment_id, recipient, status, created_at, updated_at)
     VALUES (:paymentId, :recipient, 'sending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    { paymentId: String(paymentId), recipient: normalizeDigits(recipient) },
  );
  if (!claim.affectedRows) {
    const [rows] = await dbPool.execute(
      "SELECT status, provider_message_id AS messageId FROM boleto_whatsapp_deliveries WHERE gateway_payment_id = :paymentId LIMIT 1",
      { paymentId: String(paymentId) },
    );
    return { status: rows[0]?.status || "duplicate", sent: rows[0]?.status === "sent", messageId: rows[0]?.messageId || null };
  }

  try {
    const result = await sendBoletoWhatsappTemplate({
      recipient,
      customerName,
      amount: formatMoneyBR(amount),
      dueDate: formatBoletoDueDate(dueDate),
      paymentLink,
    });
    await dbPool.execute(
      `UPDATE boleto_whatsapp_deliveries
       SET status = 'sent', provider_message_id = :messageId, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE gateway_payment_id = :paymentId`,
      { paymentId: String(paymentId), messageId: result.messageId },
    );
    return { status: "sent", sent: true, messageId: result.messageId };
  } catch (error) {
    await dbPool.execute(
      `UPDATE boleto_whatsapp_deliveries
       SET status = 'failed', error_message = :errorMessage, updated_at = CURRENT_TIMESTAMP
       WHERE gateway_payment_id = :paymentId`,
      { paymentId: String(paymentId), errorMessage: String(error.message || "Falha no envio").slice(0, 500) },
    );
    console.error("Falha ao enviar boleto automaticamente pelo WhatsApp:", { paymentId: String(paymentId), message: error.message });
    return { status: "failed", sent: false, error: "Boleto gerado, mas a mensagem de WhatsApp nao foi enviada." };
  }
}

function statusLabelForApi(status = "") {
  const labels = {
    active: "Ativo",
    authorized: "Ativo",
    approved: "Pago",
    paid: "Pago",
    pago: "Pago",
    pending: "Pendente",
    in_process: "Em analise",
    paused: "Pausado",
    cancelled: "Cancelado",
    expired: "Expirado",
    rejected: "Recusado",
    pendente: "Pendente",
    enviado: "Enviado",
    assinado: "Assinado",
    expirado: "Expirado",
    vencido: "Vencido",
    recusado: "Recusado",
  };

  return labels[String(status || "").toLowerCase()] || status || "-";
}

function splitName(name = "") {
  const parts = String(name).trim().split(/\s+/);
  const firstName = parts.shift() || "";
  return {
    firstName,
    lastName: parts.join(" "),
  };
}

function getDocumentType(documentNumber) {
  return documentNumber.length > 11 ? "CNPJ" : "CPF";
}

async function upsertCustomer({ userId, name, email, phone, document }) {
  const documentNumber = normalizeDigits(document);
  const phoneNumber = normalizeDigits(phone);
  const cnpj = documentNumber.length === 14 ? documentNumber : null;
  const normalizedEmail = cleanEmail(email);

  if (userId) {
    const [rows] = await dbPool.execute(
      "SELECT id FROM users WHERE id = :userId AND LOWER(email) = :email LIMIT 1",
      { userId, email: normalizedEmail },
    );
    if (rows[0]?.id) {
      await dbPool.execute(
        `UPDATE users SET nome = :name, telefone = :phone, whatsapp = :phone,
         documento = :documentNumber, cnpj = COALESCE(:cnpj, cnpj), updated_at = CURRENT_TIMESTAMP
         WHERE id = :userId`,
        { userId, name, phone: phoneNumber, documentNumber, cnpj },
      );
      return rows[0].id;
    }
  }

  const [result] = await dbPool.execute(
    `INSERT INTO users (nome, email, telefone, whatsapp, documento, cnpj, status)
     VALUES (:name, :email, :phone, :phone, :documentNumber, :cnpj, 'pending')
     ON DUPLICATE KEY UPDATE
       nome = VALUES(nome),
       telefone = VALUES(telefone),
       whatsapp = COALESCE(whatsapp, VALUES(whatsapp)),
       documento = VALUES(documento),
       cnpj = COALESCE(cnpj, VALUES(cnpj)),
       updated_at = CURRENT_TIMESTAMP`,
    { name, email: normalizedEmail, phone: phoneNumber, documentNumber, cnpj },
  );

  if (result.insertId) return result.insertId;

  const [rows] = await dbPool.execute("SELECT id FROM users WHERE email = :email LIMIT 1", { email: normalizedEmail });
  return rows[0]?.id;
}

function normalizeSubscriptionStatus(status) {
  const allowedStatuses = ["pending", "authorized", "active", "paused", "cancelled", "expired", "rejected"];
  if (allowedStatuses.includes(status)) return status;
  if (status === "canceled") return "cancelled";
  if (status === "approved") return "active";
  return "pending";
}

async function updateUserStatus(userId, status) {
  if (!userId || !status) return;

  await dbPool.execute(
    `UPDATE users
     SET status = :status,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :userId`,
    { userId, status },
  );
}

async function updateUserStatusFromPayment(userId, paymentStatus) {
  await refreshUserFinancialStatus(userId, { paymentStatus });
}

async function updateUserStatusFromSubscription(userId, subscriptionStatus) {
  await refreshUserFinancialStatus(userId, { subscriptionStatus: normalizeSubscriptionStatus(subscriptionStatus) });
}

function resolveUserFinancialStatus({ currentStatus, hasPaidPayment, hasActiveSubscription, paymentStatus, subscriptionStatus }) {
  if (hasPaidPayment || hasActiveSubscription) return "active";
  if (["refunded", "charged_back"].includes(paymentStatus)) return "blocked";
  if (subscriptionStatus === "cancelled") return "cancelled";
  if (["paused", "expired", "rejected"].includes(subscriptionStatus)) return "blocked";
  if (["blocked", "cancelled"].includes(currentStatus)) return currentStatus;
  return "pending";
}

async function refreshUserFinancialStatus(userId, event = {}) {
  if (!userId) return;
  const [rows] = await dbPool.execute(
    `SELECT u.status,
            EXISTS(SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status IN ('approved', 'paid', 'pago')) AS has_paid_payment,
            EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('authorized', 'active')) AS has_active_subscription
     FROM users u WHERE u.id = :userId LIMIT 1`,
    { userId },
  );
  const user = rows[0];
  if (!user) return;
  await updateUserStatus(userId, resolveUserFinancialStatus({
    currentStatus: user.status,
    hasPaidPayment: Boolean(Number(user.has_paid_payment)),
    hasActiveSubscription: Boolean(Number(user.has_active_subscription)),
    ...event,
  }));
}

function serializeMinimalGatewayPayload(data = {}, type = "payment") {
  const metadata = data.metadata || {};
  const minimal = {
    type,
    id: data.id ?? null,
    status: data.status ?? null,
    status_detail: data.status_detail ?? null,
    date_created: data.date_created ?? null,
    date_approved: data.date_approved ?? null,
    date_of_expiration: data.date_of_expiration ?? null,
    next_payment_date: data.next_payment_date ?? null,
    payment_method_id: data.payment_method_id ?? null,
    transaction_amount: data.transaction_amount ?? null,
    plan_id: metadata.plan_id ?? null,
    service_code: metadata.service_code ?? null,
  };
  return JSON.stringify(Object.fromEntries(Object.entries(minimal).filter(([, value]) => value !== null && value !== undefined)));
}

async function savePaymentRecord({ customerId, plan, paymentData, paymentMethod: _paymentMethod }) {
  await ensurePaymentsMetadataColumns();

  const [result] = await dbPool.execute(
    `INSERT INTO payments
      (mercado_pago_payment_id, gateway, gateway_payment_id, user_id, subscription_id, plan_id, payment_method, valor, status, data_pagamento, competencia, raw_payload)
     VALUES
      (:paymentId, 'mercado_pago', :paymentId, :customerId, NULL, :planId, :paymentMethod, :amount, :status, :paidAt, :competencia, :rawPayload)
     ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      plan_id = COALESCE(plan_id, VALUES(plan_id)),
      payment_method = COALESCE(VALUES(payment_method), payment_method),
      gateway = VALUES(gateway),
      gateway_payment_id = VALUES(gateway_payment_id),
      data_pagamento = VALUES(data_pagamento),
      competencia = VALUES(competencia),
      raw_payload = VALUES(raw_payload),
      updated_at = CURRENT_TIMESTAMP`,
    {
      paymentId: String(paymentData.id),
      customerId,
      planId: plan.id,
      paymentMethod: _paymentMethod || paymentData.metadata?.payment_method || paymentData.payment_method_id || null,
      amount: plan.price,
      status: paymentData.status || "pending",
      paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
      competencia: paymentData.date_approved
        ? new Date(paymentData.date_approved).toISOString().slice(0, 7)
        : new Date().toISOString().slice(0, 7),
      rawPayload: serializeMinimalGatewayPayload(paymentData, "payment"),
    },
  );

  await updateUserStatusFromPayment(customerId, paymentData.status);

  if (result.insertId) return result.insertId;

  const [rows] = await dbPool.execute(
    "SELECT id FROM payments WHERE mercado_pago_payment_id = :paymentId LIMIT 1",
    { paymentId: String(paymentData.id) },
  );
  return rows[0]?.id || null;
}

async function issuePaymentStatusToken(localPaymentId) {
  if (!localPaymentId) throw new Error("Pagamento local necessario para emitir token de acompanhamento.");
  const statusToken = createPaymentStatusToken();
  await dbPool.execute(
    `UPDATE payments
     SET status_token_hash = :tokenHash,
         status_token_expires_at = :expiresAt,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :paymentId`,
    { tokenHash: statusToken.tokenHash, expiresAt: statusToken.expiresAt, paymentId: localPaymentId },
  );
  return statusToken.token;
}

function safePaymentStatusResponse(paymentData, localPaymentId = null) {
  const paymentMethod = paymentData.metadata?.payment_method ||
    (paymentData.payment_method_id === "bolbradesco" ? "boleto" : paymentData.payment_method_id);
  return {
    id: localPaymentId,
    status: paymentData.status,
    statusDetail: paymentData.status_detail,
    message: getPaymentMessage(paymentData.status, paymentMethod),
    paymentMethod,
  };
}

async function saveSubscriptionRecord({ customerId, plan, subscriptionData, paymentMethod }) {
  const [result] = await dbPool.execute(
    `INSERT INTO subscriptions
      (user_id, plan_id, mercado_pago_subscription_id, status, valor, data_inicio, data_proxima_cobranca, metodo_pagamento, init_point, raw_payload)
     VALUES
      (:customerId, :planId, :subscriptionId, :status, :amount, :startAt, :nextChargeAt, :paymentMethod, :initPoint, :rawPayload)
     ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      valor = VALUES(valor),
      data_proxima_cobranca = VALUES(data_proxima_cobranca),
      init_point = VALUES(init_point),
      raw_payload = VALUES(raw_payload),
      updated_at = CURRENT_TIMESTAMP`,
    {
      subscriptionId: String(subscriptionData.id),
      customerId,
      planId: plan.id,
      amount: plan.price,
      paymentMethod,
      status: normalizeSubscriptionStatus(subscriptionData.status),
      startAt: subscriptionData.date_created ? new Date(subscriptionData.date_created) : new Date(),
      nextChargeAt: subscriptionData.next_payment_date ? new Date(subscriptionData.next_payment_date) : null,
      initPoint: subscriptionData.init_point || subscriptionData.sandbox_init_point || null,
      rawPayload: serializeMinimalGatewayPayload(subscriptionData, "subscription"),
    },
  );

  await updateUserStatusFromSubscription(customerId, normalizeSubscriptionStatus(subscriptionData.status));

  if (result.insertId) return result.insertId;

  const [rows] = await dbPool.execute(
    "SELECT id FROM subscriptions WHERE mercado_pago_subscription_id = :subscriptionId LIMIT 1",
    { subscriptionId: String(subscriptionData.id) },
  );
  return rows[0]?.id;
}

async function updatePaymentStatus(paymentData) {
  await ensurePaymentsMetadataColumns();
  const metadata = paymentData.metadata || {};
  const paymentMethod = metadata.payment_method || paymentData.payment_method_id || null;

  const [result] = await dbPool.execute(
    `UPDATE payments
      SET status = :status,
          valor = :amount,
          gateway = 'mercado_pago',
         gateway_payment_id = :paymentId,
         plan_id = COALESCE(plan_id, :planId),
         payment_method = COALESCE(:paymentMethod, payment_method),
         data_pagamento = :paidAt,
         competencia = :competencia,
         raw_payload = :rawPayload,
         updated_at = CURRENT_TIMESTAMP
     WHERE mercado_pago_payment_id = :paymentId`,
    {
      paymentId: String(paymentData.id),
      status: paymentData.status || "pending",
      amount: Number(paymentData.transaction_amount),
      planId: metadata.plan_id || null,
      paymentMethod,
      paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
      competencia: paymentData.date_approved
        ? new Date(paymentData.date_approved).toISOString().slice(0, 7)
        : new Date().toISOString().slice(0, 7),
      rawPayload: serializeMinimalGatewayPayload(paymentData, "payment"),
    },
  );

  if (result.affectedRows === 0) {
    const payer = paymentData.payer || {};
    const payerEmail = metadata.customer_email || payer.email;

    if (payerEmail) {
      const userId = await upsertCustomer({
        userId: null,
        name: metadata.customer_name || payer.first_name || payerEmail,
        email: payerEmail,
        phone: metadata.customer_phone || payer.phone?.number || "",
        document: metadata.customer_document || payer.identification?.number || "",
      });
      const subscriptionRef =
        metadata.mercado_pago_subscription_id ||
        metadata.subscription_id ||
        metadata.preapproval_id ||
        paymentData.preapproval_id ||
        paymentData.subscription_id ||
        null;
      let subscriptionId = null;

      if (subscriptionRef) {
        const [subscriptionRows] = await dbPool.execute(
          "SELECT id FROM subscriptions WHERE mercado_pago_subscription_id = :subscriptionRef LIMIT 1",
          { subscriptionRef },
        );
        subscriptionId = subscriptionRows[0]?.id || null;
      }

      if (!subscriptionId) {
        const [subscriptionRows] = await dbPool.execute(
          `SELECT s.id
           FROM subscriptions s
           WHERE s.user_id = :userId
             AND (:planId IS NULL OR s.plan_id = :planId)
           ORDER BY
             FIELD(s.status, 'active', 'authorized', 'pending', 'paused', 'expired', 'cancelled', 'rejected'),
             s.created_at DESC
           LIMIT 1`,
          { userId, planId: metadata.plan_id || null },
        );
        subscriptionId = subscriptionRows[0]?.id || null;
      }

      await dbPool.execute(
        `INSERT INTO payments
          (user_id, subscription_id, plan_id, payment_method, mercado_pago_payment_id, gateway, gateway_payment_id, valor, status, data_pagamento, competencia, raw_payload)
         VALUES
          (:userId, :subscriptionId, :planId, :paymentMethod, :paymentId, 'mercado_pago', :paymentId, :amount, :status, :paidAt, :competencia, :rawPayload)
         ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          subscription_id = COALESCE(subscription_id, VALUES(subscription_id)),
          plan_id = COALESCE(plan_id, VALUES(plan_id)),
          payment_method = COALESCE(VALUES(payment_method), payment_method),
          gateway = VALUES(gateway),
          gateway_payment_id = VALUES(gateway_payment_id),
          data_pagamento = VALUES(data_pagamento),
          competencia = VALUES(competencia),
          raw_payload = VALUES(raw_payload),
          updated_at = CURRENT_TIMESTAMP`,
        {
          userId,
          subscriptionId,
          planId: metadata.plan_id || null,
          paymentMethod,
          paymentId: String(paymentData.id),
          amount: Number(paymentData.transaction_amount || 0),
          status: paymentData.status || "pending",
          paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
          competencia: paymentData.date_approved
            ? new Date(paymentData.date_approved).toISOString().slice(0, 7)
            : new Date().toISOString().slice(0, 7),
          rawPayload: serializeMinimalGatewayPayload(paymentData, "payment"),
        },
      );
    }
  }

  const [rows] = await dbPool.execute(
    "SELECT id, user_id FROM payments WHERE mercado_pago_payment_id = :paymentId LIMIT 1",
    { paymentId: String(paymentData.id) },
  );
  await updateUserStatusFromPayment(rows[0]?.user_id, paymentData.status);
  return rows[0]?.id || null;
}

async function updateSubscriptionStatus(subscriptionData) {
  await dbPool.execute(
    `UPDATE subscriptions
     SET status = :status,
         data_proxima_cobranca = :nextChargeAt,
         raw_payload = :rawPayload,
         updated_at = CURRENT_TIMESTAMP
     WHERE mercado_pago_subscription_id = :subscriptionId`,
    {
      subscriptionId: String(subscriptionData.id),
      status: normalizeSubscriptionStatus(subscriptionData.status),
      nextChargeAt: subscriptionData.next_payment_date ? new Date(subscriptionData.next_payment_date) : null,
      rawPayload: serializeMinimalGatewayPayload(subscriptionData, "subscription"),
    },
  );

  const [rows] = await dbPool.execute(
    "SELECT user_id FROM subscriptions WHERE mercado_pago_subscription_id = :subscriptionId LIMIT 1",
    { subscriptionId: String(subscriptionData.id) },
  );
  await updateUserStatusFromSubscription(rows[0]?.user_id, normalizeSubscriptionStatus(subscriptionData.status));
}

function storePayment(paymentData) {
  if (!paymentData?.id) return;

  paymentStore.set(String(paymentData.id), {
    id: paymentData.id,
    status: paymentData.status,
    statusDetail: paymentData.status_detail,
    externalReference: paymentData.external_reference,
    metadata: paymentData.metadata,
    paymentMethod: paymentData.metadata?.payment_method || paymentData.payment_method_id,
    updatedAt: new Date().toISOString(),
  });
}

function getPaymentMessage(status, method = "pix") {
  const messages = {
    approved: "Pagamento aprovado. Obrigado!",
    pending: method === "boleto" ? "Boleto gerado. Aguardando compensacao bancaria." : "Aguardando pagamento Pix.",
    in_process: "Pagamento em analise pelo Mercado Pago.",
    rejected: method === "boleto" ? "Boleto recusado. Gere um novo boleto ou tente outro metodo." : "Pagamento recusado. Gere um novo Pix ou tente outro metodo.",
    cancelled: "Pagamento cancelado.",
    refunded: "Pagamento estornado.",
  };

  return messages[status] || "Aguardando atualizacao do pagamento.";
}

function getSubscriptionMessage(status) {
  const messages = {
    authorized: "Assinatura autorizada. As cobrancas recorrentes serao feitas pelo Mercado Pago.",
    pending: "Finalize a autorizacao da assinatura no Mercado Pago.",
    paused: "Assinatura pausada.",
    cancelled: "Assinatura cancelada.",
  };

  return messages[status] || "Aguardando autorizacao da assinatura.";
}

function ensureSinglePaymentPlan(plan) {
  return Boolean(plan);
}

function buildCustomerPaymentProfile(customer = {}) {
  const name = cleanText(customer.nome || customer.name, 160);
  const email = cleanText(customer.email, 160);
  const phone = normalizeDigits(customer.whatsapp || customer.telefone || customer.phone || "");
  const documentNumber = normalizeDigits(customer.documento || customer.cnpj || customer.document || "");

  return {
    name,
    email,
    phone,
    documentNumber,
    cnpj: documentNumber.length === 14 ? documentNumber : normalizeDigits(customer.cnpj || ""),
    address: {
      cep: customer.cep,
      logradouro: customer.logradouro,
      numero: customer.numero,
      bairro: customer.bairro,
      cidade: customer.municipio || customer.cidade,
      uf: customer.uf,
    },
  };
}

async function createMercadoPagoSinglePayment({ customerId, customer, plan, paymentMethod, address = {}, dueDate }) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const profile = buildCustomerPaymentProfile(customer);
  const { firstName, lastName } = splitName(profile.name);

  if (!plan) throw new Error("Plano invalido.");
  ensureSinglePaymentPlan(plan);

  if (!profile.name || !profile.email || !profile.phone || !profile.documentNumber) {
    throw new Error("Cliente precisa ter nome, e-mail, WhatsApp e CPF/CNPJ para gerar cobranca.");
  }

  if (!isValidCpfOrCnpj(profile.documentNumber)) {
    throw new Error("Cliente precisa ter CPF ou CNPJ valido para gerar cobranca.");
  }

  if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
    throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
  }

  const isBoleto = paymentMethod === "boleto";
  const boletoExpiration = isBoleto ? getBoletoExpirationDate(dueDate) : null;
  const methodAddress = isBoleto ? { ...profile.address, ...address } : {};
  const { normalizedAddress, missingFields } = isBoleto
    ? validateBoletoAddress(methodAddress)
    : { normalizedAddress: null, missingFields: [] };

  if (missingFields.length) {
    throw new Error(`Preencha os dados do endereco para gerar o boleto: ${missingFields.join(", ")}.`);
  }

  const externalReference = `facilita-admin-${paymentMethod}-${Date.now()}-${crypto.randomUUID()}`;
  const payer = {
    email: profile.email,
    first_name: firstName,
    last_name: lastName,
    identification: {
      type: getDocumentType(profile.documentNumber),
      number: profile.documentNumber,
    },
    phone: {
      number: profile.phone,
    },
  };

  if (isBoleto) {
    payer.address = {
      zip_code: normalizedAddress.zipCode,
      street_name: normalizedAddress.streetName,
      street_number: normalizedAddress.streetNumber,
      neighborhood: normalizedAddress.neighborhood,
      city: normalizedAddress.city,
      federal_unit: normalizedAddress.federalUnit,
    };
  }

  const mercadoPagoResponse = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: plan.price,
      description: `${plan.title} - Facilita MEI`,
      payment_method_id: isBoleto ? "bolbradesco" : "pix",
      ...(isBoleto ? { date_of_expiration: boletoExpiration } : {}),
      external_reference: externalReference,
      notification_url: mercadoPagoWebhookUrl,
      payer,
      metadata: {
        origin: "admin",
        plan_id: plan.id,
        plan_name: plan.title,
        service_code: plan.serviceCode,
        customer_id: customerId,
        customer_name: profile.name,
        customer_email: profile.email,
        customer_phone: profile.phone,
        customer_document: profile.documentNumber,
        payment_method: paymentMethod,
        ...(isBoleto
          ? {
              customer_zip_code: normalizedAddress.zipCode,
              customer_city: normalizedAddress.city,
              customer_uf: normalizedAddress.federalUnit,
            }
          : {}),
      },
    }),
  });

  const data = await mercadoPagoResponse.json();

  if (!mercadoPagoResponse.ok) {
    const error = new Error(getMercadoPagoPaymentError(data, `Erro ao criar ${isBoleto ? "boleto" : "Pix"} no Mercado Pago.`));
    error.status = mercadoPagoResponse.status;
    error.details = data;
    throw error;
  }

  storePayment(data);
  await savePaymentRecord({ customerId, plan, paymentData: data, paymentMethod });

  const transactionData = data.point_of_interaction?.transaction_data || {};
  const ticketUrl = isBoleto
    ? data.transaction_details?.external_resource_url || data.transaction_details?.ticket_url
    : transactionData.ticket_url;
  const resolvedDueDate = isBoleto ? String(data.date_of_expiration || boletoExpiration).slice(0, 10) : null;
  const whatsappDelivery = isBoleto
    ? await sendAutomaticBoletoWhatsapp({
        paymentId: data.id, recipient: profile.phone, customerName: profile.name,
        amount: plan.price, dueDate: resolvedDueDate, paymentLink: ticketUrl,
      })
    : null;

  return {
    customerId,
    paymentId: data.id,
    status: data.status,
    statusDetail: data.status_detail,
    message: getPaymentMessage(data.status, paymentMethod),
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
    ticketUrl,
    externalResourceUrl: data.transaction_details?.external_resource_url,
    externalReference,
    amount: plan.price,
    planName: plan.title,
    paymentMethod,
    dueDate: resolvedDueDate,
    customerName: profile.name,
    customerPhone: profile.phone,
    whatsappDelivery,
  };
}

function ensureSubscriptionPlan(plan) {
  if (plan.billing !== "subscription") {
    throw new Error("Este servico e pagamento avulso. Use Pix ou cartao comum.");
  }
}

function ensureMercadoPagoPlan(plan) {
  if (!plan.mercadoPagoPlanId) {
    throw new Error(
      "Este plano ainda nao tem mercado_pago_plan_id. Crie/sincronize o plano no Mercado Pago antes de vender assinatura recorrente.",
    );
  }
}

function isMercadoPagoSignatureValid(request, paymentId) {
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;

  if (!webhookSecret) return false;

  const signature = request.get("x-signature") || "";
  const requestId = request.get("x-request-id") || "";
  const signatureParts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, value] = part.trim().split("=");
      return [key, value];
    }),
  );

  if (!paymentId || !requestId || !signatureParts.ts || !signatureParts.v1) {
    return false;
  }

  // O Mercado Pago especifica que data.id deve ser normalizado para minusculas.
  const normalizedPaymentId = String(paymentId).toLowerCase();
  const manifest = `id:${normalizedPaymentId};request-id:${requestId};ts:${signatureParts.ts};`;
  const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureParts.v1));
  } catch {
    return false;
  }
}

function getMercadoPagoWebhookDescriptor(request) {
  const topic = String(request.query.topic || request.query.type || request.body?.type || "");
  const action = String(request.body?.action || "");
  const resource = String(request.query.resource || request.body?.resource || "");
  const resourceFromUrl = resource.match(/\/([^/?#]+)(?:[?#].*)?$/)?.[1] || "";
  const resourceId = String(
    request.query["data.id"] ||
      request.query.data_id ||
      request.body?.data?.id ||
      request.query.preapproval_id ||
      request.query.id ||
      request.body?.id ||
      resourceFromUrl ||
      "",
  );
  const type = topic === "payment" || action.startsWith("payment.")
    ? "payment"
    : topic === "subscription_preapproval" || topic === "preapproval" || action.startsWith("preapproval.")
      ? "subscription"
      : null;
  return { type, topic: topic || action || "unknown", action, resourceId };
}

async function recordMercadoPagoWebhookReceipt({ request, descriptor, status, httpStatus, errorCode = null }) {
  const receiptId = crypto.randomUUID();
  const requestId = String(request.get("x-request-id") || "").slice(0, 120) || null;
  try {
    await dbPool.execute(
      `INSERT INTO mercado_pago_webhook_receipts
        (receipt_id, request_id, topic, resource_id, signature_present, status, http_status, error_code)
       VALUES (:receiptId, :requestId, :topic, :resourceId, :signaturePresent, :status, :httpStatus, :errorCode)`,
      {
        receiptId,
        requestId,
        topic: String(descriptor.topic || "unknown").slice(0, 120),
        resourceId: String(descriptor.resourceId || "").slice(0, 180) || null,
        signaturePresent: Boolean(request.get("x-signature")),
        status,
        httpStatus,
        errorCode,
      },
    );
  } catch (error) {
    console.error("Falha ao registrar recebimento do webhook Mercado Pago:", { receiptId, message: error.message });
  }
  return receiptId;
}

async function claimMercadoPagoWebhookEvent({ requestId, topic, resourceId }) {
  const eventKey = crypto.createHash("sha256").update(`${requestId}:${topic}:${resourceId}`).digest("hex");
  const [result] = await dbPool.execute(
    `INSERT IGNORE INTO mercado_pago_webhook_events
      (event_key, request_id, topic, resource_id, status)
     VALUES (:eventKey, :requestId, :topic, :resourceId, 'processing')`,
    { eventKey, requestId, topic, resourceId },
  );
  if (result.affectedRows === 1) return { claimed: true, eventKey };

  const [rows] = await dbPool.execute(
    "SELECT status, updated_at FROM mercado_pago_webhook_events WHERE event_key = :eventKey LIMIT 1",
    { eventKey },
  );
  const existing = rows[0];
  const processingIsStale = existing?.status === "processing" &&
    Date.now() - new Date(existing.updated_at).getTime() > 5 * 60 * 1000;
  if (existing?.status !== "failed" && !processingIsStale) return { claimed: false, eventKey };

  const [retryResult] = await dbPool.execute(
    `UPDATE mercado_pago_webhook_events
     SET status = 'processing', attempts = attempts + 1, error_message = NULL
     WHERE event_key = :eventKey
       AND (status = 'failed' OR (status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)))`,
    { eventKey },
  );
  return { claimed: retryResult.affectedRows === 1, eventKey };
}

async function finishMercadoPagoWebhookEvent(eventKey, error = null) {
  await dbPool.execute(
    `UPDATE mercado_pago_webhook_events
     SET status = :status,
         error_message = :errorMessage,
         processed_at = :processedAt
     WHERE event_key = :eventKey`,
    {
      eventKey,
      status: error ? "failed" : "processed",
      errorMessage: error ? String(error.message || error).slice(0, 1000) : null,
      processedAt: error ? null : new Date(),
    },
  );
}

function assertMoneyMatches(actual, expected, message) {
  if (!Number.isFinite(Number(actual)) || Math.abs(Number(actual) - Number(expected)) > 0.01) {
    const error = new Error(message);
    error.status = 422;
    throw error;
  }
}

async function validateMercadoPagoPayment(paymentData) {
  if (!paymentData?.id) throw Object.assign(new Error("Pagamento sem identificador."), { status: 422 });
  if (paymentData.currency_id && paymentData.currency_id !== "BRL") {
    throw Object.assign(new Error("Moeda do pagamento divergente."), { status: 422 });
  }

  const [localRows] = await dbPool.execute(
    `SELECT p.valor, COALESCE(p.plan_id, s.plan_id) AS plan_id
     FROM payments p
     LEFT JOIN subscriptions s ON s.id = p.subscription_id
     WHERE p.mercado_pago_payment_id = :paymentId
     LIMIT 1`,
    { paymentId: String(paymentData.id) },
  );
  let expectedAmount = localRows[0]?.valor;
  const expectedPlanId = localRows[0]?.plan_id || paymentData.metadata?.plan_id || null;

  if (expectedAmount === undefined && expectedPlanId) {
    const plan = await getPlanById(expectedPlanId);
    if (!plan) throw Object.assign(new Error("Plano do pagamento nao encontrado."), { status: 422 });
    expectedAmount = plan.price;
  }
  if (expectedAmount === undefined) {
    throw Object.assign(new Error("Pagamento sem vinculo local ou plano valido."), { status: 422 });
  }
  assertMoneyMatches(paymentData.transaction_amount, expectedAmount, "Valor do pagamento divergente.");
}

async function validateMercadoPagoSubscription(subscriptionData) {
  if (!subscriptionData?.id) throw Object.assign(new Error("Assinatura sem identificador."), { status: 422 });
  const [rows] = await dbPool.execute(
    `SELECT s.valor, s.plan_id, p.mercado_pago_plan_id
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.mercado_pago_subscription_id = :subscriptionId
     LIMIT 1`,
    { subscriptionId: String(subscriptionData.id) },
  );
  const local = rows[0];
  if (!local) throw Object.assign(new Error("Assinatura nao encontrada no sistema."), { status: 404 });
  if (subscriptionData.preapproval_plan_id && local.mercado_pago_plan_id &&
      String(subscriptionData.preapproval_plan_id) !== String(local.mercado_pago_plan_id)) {
    throw Object.assign(new Error("Plano Mercado Pago divergente."), { status: 422 });
  }
  const recurring = subscriptionData.auto_recurring || {};
  if (recurring.currency_id && recurring.currency_id !== "BRL") {
    throw Object.assign(new Error("Moeda da assinatura divergente."), { status: 422 });
  }
  if (recurring.transaction_amount !== undefined) {
    assertMoneyMatches(recurring.transaction_amount, local.valor, "Valor da assinatura divergente.");
  }
}

app.post("/api/payments/pix", paymentCreationLimiter, async (request, response) => {
  try {
    const body = request.body || {};
    const { planId, userId, email } = body;
    const name = body.nome || body.name;
    const phone = body.telefone || body.phone;
    const document = body.documento || body.document;
    const plan = await getPlanById(planId);
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const documentNumber = normalizeDigits(document);
    const phoneNumber = normalizeDigits(phone);
    const { firstName, lastName } = splitName(name);

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSinglePaymentPlan(plan);

    if (!name || !email || !phone || !documentNumber) {
      return response.status(400).json({ error: "Nome, e-mail, WhatsApp e CPF/CNPJ sao obrigatorios." });
    }

    if (!isValidCpfOrCnpj(documentNumber)) {
      return response.status(400).json({ error: "Informe um CPF ou CNPJ valido para gerar o Pix." });
    }

    if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
      throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
    }

    const externalReference = `facilita-${Date.now()}-${crypto.randomUUID()}`;
    const mercadoPagoResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: plan.price,
        description: `${plan.title} - Facilita MEI`,
        payment_method_id: "pix",
        external_reference: externalReference,
        notification_url: mercadoPagoWebhookUrl,
        payer: {
          email,
          first_name: firstName,
          last_name: lastName,
          identification: {
            type: getDocumentType(documentNumber),
            number: documentNumber,
          },
          phone: {
            number: phoneNumber,
          },
        },
        metadata: {
          plan_id: plan.id,
          plan_name: plan.title,
          service_code: plan.serviceCode,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_document: documentNumber,
          payment_method: "pix",
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      return response.status(mercadoPagoResponse.status).json({
        error: getMercadoPagoPaymentError(data, "Erro ao criar pagamento Pix no Mercado Pago."),
        details: data,
      });
    }

    storePayment(data);
    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    const localPaymentId = await savePaymentRecord({ customerId, plan, paymentData: data, paymentMethod: "pix" });
    const paymentStatusToken = await issuePaymentStatusToken(localPaymentId);

    const transactionData = data.point_of_interaction?.transaction_data || {};

    response.json({
      customerId,
      paymentId: data.id,
      paymentStatusToken,
      status: data.status,
      statusDetail: data.status_detail,
      message: getPaymentMessage(data.status),
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      ticketUrl: transactionData.ticket_url,
      externalReference,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar Pix." });
  }
});

app.post("/api/payments/boleto", paymentCreationLimiter, async (request, response) => {
  try {
    const body = request.body || {};
    const { planId, userId, email, dueDate } = body;
    const name = body.nome || body.name;
    const phone = body.telefone || body.phone;
    const document = body.documento || body.document;
    const address = body.endereco || body.address || {};
    const plan = await getPlanById(planId);
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const documentNumber = normalizeDigits(document);
    const phoneNumber = normalizeDigits(phone);
    const { firstName, lastName } = splitName(name);
    const { normalizedAddress, missingFields } = validateBoletoAddress(address);

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSinglePaymentPlan(plan);

    if (!name || !email || !phone || !documentNumber) {
      return response.status(400).json({ error: "Nome, e-mail, WhatsApp e CPF/CNPJ sao obrigatorios." });
    }

    if (!isValidCpfOrCnpj(documentNumber)) {
      return response.status(400).json({ error: "Informe um CPF ou CNPJ valido para gerar o boleto." });
    }

    if (missingFields.length) {
      return response.status(400).json({
        error: `Preencha os dados do endereco para gerar o boleto: ${missingFields.join(", ")}.`,
      });
    }

    if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
      throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
    }

    const externalReference = `facilita-boleto-${Date.now()}-${crypto.randomUUID()}`;
    const mercadoPagoResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: plan.price,
        description: `${plan.title} - Facilita MEI`,
        payment_method_id: "bolbradesco",
        date_of_expiration: getBoletoExpirationDate(dueDate),
        external_reference: externalReference,
        notification_url: mercadoPagoWebhookUrl,
        payer: {
          email,
          first_name: firstName,
          last_name: lastName,
          identification: {
            type: getDocumentType(documentNumber),
            number: documentNumber,
          },
          phone: {
            number: phoneNumber,
          },
          address: {
            zip_code: normalizedAddress.zipCode,
            street_name: normalizedAddress.streetName,
            street_number: normalizedAddress.streetNumber,
            neighborhood: normalizedAddress.neighborhood,
            city: normalizedAddress.city,
            federal_unit: normalizedAddress.federalUnit,
          },
        },
        metadata: {
          plan_id: plan.id,
          plan_name: plan.title,
          service_code: plan.serviceCode,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_document: documentNumber,
          customer_zip_code: normalizedAddress.zipCode,
          customer_city: normalizedAddress.city,
          customer_uf: normalizedAddress.federalUnit,
          payment_method: "boleto",
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      return response.status(mercadoPagoResponse.status).json({
        error: getMercadoPagoPaymentError(data, "Erro ao criar boleto no Mercado Pago."),
        details: data,
      });
    }

    storePayment(data);
    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    const localPaymentId = await savePaymentRecord({ customerId, plan, paymentData: data, paymentMethod: "boleto" });
    const paymentStatusToken = await issuePaymentStatusToken(localPaymentId);
    const ticketUrl = data.transaction_details?.external_resource_url || data.transaction_details?.ticket_url;
    const resolvedDueDate = String(data.date_of_expiration || getBoletoExpirationDate(dueDate)).slice(0, 10);
    const whatsappDelivery = await sendAutomaticBoletoWhatsapp({
      paymentId: data.id,
      recipient: phoneNumber,
      customerName: name,
      amount: plan.price,
      dueDate: resolvedDueDate,
      paymentLink: ticketUrl,
    });

    response.json({
      customerId,
      paymentId: data.id,
      paymentStatusToken,
      status: data.status,
      statusDetail: data.status_detail,
      message: getPaymentMessage(data.status, "boleto"),
      ticketUrl,
      externalResourceUrl: data.transaction_details?.external_resource_url,
      externalReference,
      dueDate: resolvedDueDate,
      whatsappDelivery,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar boleto." });
  }
});

app.post("/api/payments/card", paymentCreationLimiter, async (request, response) => {
  try {
    const body = request.body || {};
    const { planId, userId, email, paymentMethodId, issuerId, installments = 1 } = body;
    const name = body.nome || body.name;
    const phone = body.telefone || body.phone;
    const document = body.documento || body.document;
    const cardToken = body.cardTokenId || body.cardToken;
    const plan = await getPlanById(planId);
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const documentNumber = normalizeDigits(document);
    const phoneNumber = normalizeDigits(phone);
    const { firstName, lastName } = splitName(name);

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSinglePaymentPlan(plan);

    if (!name || !email || !phone || !documentNumber) {
      return response.status(400).json({ error: "Nome, e-mail, WhatsApp e CPF/CNPJ sao obrigatorios." });
    }

    if (!isValidCpfOrCnpj(documentNumber)) {
      return response.status(400).json({ error: "Informe um CPF ou CNPJ valido para pagar com cartao." });
    }

    if (!cardToken || !paymentMethodId) {
      return response.status(400).json({ error: "Token e bandeira do cartao sao obrigatorios." });
    }

    if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
      throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
    }

    const externalReference = `facilita-card-${Date.now()}-${crypto.randomUUID()}`;
    const mercadoPagoResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: plan.price,
        token: cardToken,
        description: `${plan.title} - Facilita MEI`,
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        issuer_id: issuerId,
        external_reference: externalReference,
        notification_url: mercadoPagoWebhookUrl,
        payer: {
          email,
          first_name: firstName,
          last_name: lastName,
          identification: {
            type: getDocumentType(documentNumber),
            number: documentNumber,
          },
          phone: {
            number: phoneNumber,
          },
        },
        metadata: {
          plan_id: plan.id,
          plan_name: plan.title,
          service_code: plan.serviceCode,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_document: documentNumber,
          payment_method: "card",
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      return response.status(mercadoPagoResponse.status).json({
        error: getMercadoPagoPaymentError(data, "Erro ao criar pagamento com cartao no Mercado Pago."),
        details: data,
      });
    }

    storePayment(data);
    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    const localPaymentId = await savePaymentRecord({ customerId, plan, paymentData: data, paymentMethod: "card" });
    const paymentStatusToken = await issuePaymentStatusToken(localPaymentId);

    response.json({
      paymentId: data.id,
      paymentStatusToken,
      status: data.status,
      statusDetail: data.status_detail,
      message: getPaymentMessage(data.status),
      externalReference,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar pagamento com cartao." });
  }
});

app.post("/api/subscriptions/card", paymentCreationLimiter, async (request, response) => {
  try {
    const body = request.body || {};
    const {
      planId,
      userId,
      email,
    } = body;
    const name = body.nome || body.name;
    const phone = body.telefone || body.phone;
    const document = body.documento || body.document;
    const cardToken = body.cardTokenId || body.cardToken;
    const plan = await getPlanById(planId);
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const documentNumber = normalizeDigits(document);

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSubscriptionPlan(plan);
    ensureMercadoPagoPlan(plan);

    if (!name || !email || !phone || !documentNumber) {
      return response.status(400).json({ error: "Nome, e-mail, WhatsApp e CPF/CNPJ sao obrigatorios." });
    }

    if (!cardToken) {
      return response.status(400).json({ error: "Token do cartao e obrigatorio para assinatura recorrente." });
    }

    if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
      throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
    }

    const mercadoPagoResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preapproval_plan_id: plan.mercadoPagoPlanId,
        reason: plan.title,
        external_reference: `facilita-sub-card-${Date.now()}-${crypto.randomUUID()}`,
        payer_email: email,
        card_token_id: cardToken,
        auto_recurring: {
          frequency: plan.frequency,
          frequency_type: plan.frequencyType,
          transaction_amount: plan.price,
          currency_id: "BRL",
        },
        back_url: `${mercadoPagoBackUrl}/?subscription=authorized`,
        status: "authorized",
        metadata: {
          plan_id: plan.id,
          plan_name: plan.title,
          mercado_pago_plan_id: plan.mercadoPagoPlanId,
          service_code: plan.serviceCode,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_document: documentNumber,
          payment_method: "card_subscription",
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      console.error("Erro Mercado Pago ao criar assinatura:", {
        status: mercadoPagoResponse.status,
        message: data.message,
        error: data.error,
        cause: data.cause,
      });

      return response.status(mercadoPagoResponse.status).json({
        error: data.message || "Erro ao criar assinatura recorrente com cartao.",
        details: data,
      });
    }

    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    const localSubscriptionId = await saveSubscriptionRecord({ customerId, plan, subscriptionData: data, paymentMethod: "card" });
    enviarEmailAssinaturaCriada(localSubscriptionId).catch((error) => {
      console.error("Falha ao disparar e-mail de assinatura:", error);
    });

    response.json({
      customerId,
      localSubscriptionId,
      subscriptionId: data.id,
      status: data.status,
      message: getSubscriptionMessage(data.status),
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar assinatura recorrente." });
  }
});

app.post("/api/subscriptions/pix-auto", paymentCreationLimiter, async (request, response) => {
  try {
    const body = request.body || {};
    const { planId, userId, email } = body;
    const name = body.nome || body.name;
    const phone = body.telefone || body.phone;
    const document = body.documento || body.document;
    const plan = await getPlanById(planId);
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const documentNumber = normalizeDigits(document);

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSubscriptionPlan(plan);

    if (plan.mercadoPagoPlanId) {
      return response.status(400).json({
        error:
          "Este plano usa plano associado no Mercado Pago. Para plano associado, a assinatura deve ser criada com cartao autorizado.",
      });
    }

    if (!name || !email || !phone || !documentNumber) {
      return response.status(400).json({ error: "Nome, e-mail, WhatsApp e CPF/CNPJ sao obrigatorios." });
    }

    if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
      throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env");
    }

    const mercadoPagoResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: plan.title,
        external_reference: `facilita-sub-pix-${Date.now()}-${crypto.randomUUID()}`,
        payer_email: email,
        back_url: `${mercadoPagoBackUrl}/?subscription=return`,
        status: "pending",
        auto_recurring: {
          frequency: plan.frequency,
          frequency_type: plan.frequencyType,
          transaction_amount: plan.price,
          currency_id: "BRL",
        },
        metadata: {
          plan_id: plan.id,
          plan_name: plan.title,
          service_code: plan.serviceCode,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_document: documentNumber,
          payment_method: "pix_auto_subscription",
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      return response.status(mercadoPagoResponse.status).json({
        error: data.message || "Erro ao criar assinatura com Pix automatico no Mercado Pago.",
        details: data,
      });
    }

    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    const localSubscriptionId = await saveSubscriptionRecord({ customerId, plan, subscriptionData: data, paymentMethod: "pix_auto" });
    enviarEmailAssinaturaCriada(localSubscriptionId).catch((error) => {
      console.error("Falha ao disparar e-mail de assinatura:", error);
    });

    response.json({
      customerId,
      localSubscriptionId,
      subscriptionId: data.id,
      status: data.status,
      message: getSubscriptionMessage(data.status),
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar assinatura com Pix automatico." });
  }
});

app.post("/api/payments/status", paymentStatusLimiter, async (request, response) => {
  try {
    const token = String(request.body?.token || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return response.status(401).json({ error: "Token de acompanhamento invalido ou expirado." });
    }
    const [rows] = await dbPool.execute(
      `SELECT id, user_id, mercado_pago_payment_id, status, valor
       FROM payments
       WHERE status_token_hash = :tokenHash
         AND status_token_expires_at > NOW()
       LIMIT 1`,
      { tokenHash: hashPaymentStatusToken(token) },
    );
    const localPayment = rows[0];
    if (!localPayment) return response.status(401).json({ error: "Token de acompanhamento invalido ou expirado." });

    const client = getMercadoPagoClient();
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: localPayment.mercado_pago_payment_id });

    storePayment(paymentData);
    const localPaymentId = await updatePaymentStatus(paymentData);
    if (paymentData.status === "approved" && localPayment.status !== "approved") {
      enviarEmailPagamentoAprovado(localPaymentId).catch((error) => {
        console.error("Falha ao disparar e-mail de pagamento aprovado pelo polling:", error);
      });
      const setupEmail = paymentData.metadata?.customer_email || paymentData.payer?.email;
      if (setupEmail) {
        sendClientAuthToken(setupEmail, "setup").catch((error) => {
          console.error("Falha ao enviar ativacao da area do cliente pelo polling:", error.message);
        });
      }
    }
    const statusResponse = safePaymentStatusResponse(paymentData, localPayment.id);
    if (paymentData.status === "approved" && localPayment.user_id) {
      const [userRows] = await dbPool.execute(
        "SELECT id, senha_hash FROM users WHERE id = :userId LIMIT 1",
        { userId: localPayment.user_id },
      );
      if (userRows[0] && !userRows[0].senha_hash) {
        const onboardingToken = await issueClientAuthToken(userRows[0].id, "setup");
        statusResponse.onboarding = { action: "setup", token: onboardingToken.token };
      }
    }
    response.json(statusResponse);
  } catch (error) {
    console.error("Erro ao consultar pagamento por token:", error.message);
    response.status(500).json({ error: error.message || "Erro ao consultar pagamento." });
  }
});

app.get("/api/payments/:id/status", (_request, response) => {
  response.status(410).json({ error: "Consulta por ID descontinuada. Use token temporario ou area autenticada." });
});

app.get("/api/client/payments/:paymentId/status", requireClientSession, paymentStatusLimiter, async (request, response) => {
  try {
    const paymentId = Number(request.params.paymentId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return response.status(400).json({ error: "Pagamento invalido." });
    const [rows] = await dbPool.execute(
      `SELECT id, mercado_pago_payment_id, status
       FROM payments
       WHERE id = :paymentId AND user_id = :userId
       LIMIT 1`,
      { paymentId, userId: request.clientSession.userId },
    );
    const localPayment = rows[0];
    if (!localPayment) return response.status(404).json({ error: "Pagamento nao encontrado." });

    const client = getMercadoPagoClient();
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: localPayment.mercado_pago_payment_id });
    await updatePaymentStatus(paymentData);
    response.json(safePaymentStatusResponse(paymentData, localPayment.id));
  } catch (error) {
    console.error("Erro ao consultar pagamento autenticado:", error.message);
    response.status(500).json({ error: "Erro ao consultar pagamento." });
  }
});

app.post("/api/checkout", paymentCreationLimiter, async (request, response) => {
  try {
    const { planId, name, email, phone } = request.body || {};
    const plan = await getPlanById(planId);

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSinglePaymentPlan(plan);

    if (!name || !email || !phone) {
      return response.status(400).json({ error: "Nome, e-mail e WhatsApp sao obrigatorios." });
    }

    const client = getMercadoPagoClient();
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: plan.id,
            title: plan.title,
            description: plan.description,
            quantity: 1,
            currency_id: "BRL",
            unit_price: plan.price,
          },
        ],
        payer: {
          name,
          email,
          phone: {
            number: String(phone).replace(/\D/g, ""),
          },
        },
        metadata: {
          plan_id: plan.id,
          plan_name: plan.title,
          service_code: plan.serviceCode,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
        },
        back_urls: {
          success: `${mercadoPagoBackUrl}/?payment=success#checkout`,
          pending: `${mercadoPagoBackUrl}/?payment=pending#checkout`,
          failure: `${mercadoPagoBackUrl}/?payment=failure#checkout`,
        },
        auto_return: "approved",
        notification_url: mercadoPagoWebhookUrl,
      },
    });

    response.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar checkout." });
  }
});

app.post("/api/subscription", paymentCreationLimiter, async (request, response) => {
  response.status(410).json({
    error: "Rota descontinuada. Use /api/subscriptions/card com planId e cardTokenId para plano associado.",
  });
});

app.post("/api/webhooks/mercadopago", webhookLimiter, async (request, response) => {
  const descriptor = getMercadoPagoWebhookDescriptor(request);
  console.log("Webhook Mercado Pago recebido:", {
    topic: descriptor.topic,
    resourceId: descriptor.resourceId || null,
    requestId: request.get("x-request-id") || null,
    signaturePresent: Boolean(request.get("x-signature")),
  });
  if (!descriptor.type) {
    await recordMercadoPagoWebhookReceipt({ request, descriptor, status: "ignored", httpStatus: 200, errorCode: "unsupported_topic" });
    return response.status(200).json({ ok: true, ignored: true });
  }

  const requestId = String(request.get("x-request-id") || "");
  if (!descriptor.resourceId || !isMercadoPagoSignatureValid(request, descriptor.resourceId)) {
    await recordMercadoPagoWebhookReceipt({
      request, descriptor, status: "rejected", httpStatus: 401,
      errorCode: descriptor.resourceId ? "invalid_signature" : "missing_resource_id",
    });
    return response.status(401).json({ error: "Assinatura do webhook invalida." });
  }

  let eventKey = null;
  const receiptId = await recordMercadoPagoWebhookReceipt({ request, descriptor, status: "accepted", httpStatus: 200 });
  try {
    const claim = await claimMercadoPagoWebhookEvent({
      requestId,
      topic: descriptor.topic,
      resourceId: descriptor.resourceId,
    });
    eventKey = claim.eventKey;
    if (!claim.claimed) return response.status(200).json({ ok: true, duplicate: true });

    if (descriptor.type === "payment") {
      const client = getMercadoPagoClient();
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: descriptor.resourceId });

      await validateMercadoPagoPayment(paymentData);
      const [previousPaymentRows] = await dbPool.execute(
        "SELECT status FROM payments WHERE mercado_pago_payment_id = :paymentId LIMIT 1",
        { paymentId: String(paymentData.id) },
      );
      storePayment(paymentData);
      const localPaymentId = await updatePaymentStatus(paymentData);
      if (localPaymentId && paymentData.status === "approved" && previousPaymentRows[0]?.status !== "approved") {
        enviarEmailPagamentoAprovado(localPaymentId).catch((error) => {
          console.error("Falha ao disparar e-mail de pagamento aprovado:", error);
        });
        const setupEmail = paymentData.metadata?.customer_email || paymentData.payer?.email;
        if (setupEmail) {
          sendClientAuthToken(setupEmail, "setup").catch((error) => {
            console.error("Falha ao enviar ativacao da area do cliente:", error.message);
          });
        }
      }

      console.log("Webhook Mercado Pago processado:", { type: "payment", id: String(paymentData.id), status: paymentData.status });
    }

    if (descriptor.type === "subscription") {
      const accessToken = getAccessTokenOrThrow();
      const mercadoPagoResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(descriptor.resourceId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const subscriptionData = await mercadoPagoResponse.json();
      if (!mercadoPagoResponse.ok) {
        const error = new Error(subscriptionData.message || "Erro ao consultar assinatura no Mercado Pago.");
        error.status = mercadoPagoResponse.status;
        throw error;
      }
      await validateMercadoPagoSubscription(subscriptionData);
      await updateSubscriptionStatus(subscriptionData);
      console.log("Webhook Mercado Pago processado:", { type: "subscription", id: String(subscriptionData.id), status: subscriptionData.status });
    }

    await finishMercadoPagoWebhookEvent(eventKey);
    await dbPool.execute("UPDATE mercado_pago_webhook_receipts SET status = 'processed' WHERE receipt_id = :receiptId", { receiptId });
    return response.status(200).json({ ok: true });
  } catch (error) {
    if (eventKey) {
      try {
        await finishMercadoPagoWebhookEvent(eventKey, error);
      } catch (eventError) {
        console.error("Falha ao registrar erro do webhook:", eventError.message);
      }
    }
    console.error("Falha no webhook Mercado Pago:", {
      type: descriptor.type,
      resourceId: descriptor.resourceId,
      message: error.message,
    });
    try {
      await dbPool.execute(
        `UPDATE mercado_pago_webhook_receipts SET status = 'failed', http_status = :httpStatus,
         error_code = :errorCode WHERE receipt_id = :receiptId`,
        { receiptId, httpStatus: Number(error.status || 500), errorCode: String(error.code || "processing_failed").slice(0, 120) },
      );
    } catch (receiptError) {
      console.error("Falha ao atualizar recebimento do webhook:", receiptError.message);
    }
    return response.status(error.status || 500).json({ error: "Falha ao processar webhook." });
  }
});

app.get("/api/admin/webhooks/mercadopago/diagnostics", requireAdminSession, async (_request, response, next) => {
  try {
    const [receipts] = await dbPool.execute(
      `SELECT receipt_id, request_id, topic, resource_id, signature_present, status, http_status, error_code, created_at
       FROM mercado_pago_webhook_receipts ORDER BY created_at DESC LIMIT 100`,
    );
    response.json({
      configuration: {
        notificationUrl: mercadoPagoWebhookUrl,
        https: mercadoPagoWebhookUrl.startsWith("https://"),
        secretConfigured: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET),
      },
      receipts,
    });
  } catch (error) { next(error); }
});

app.post("/api/testes/webhook/mercadopago/payment", requireAdminKey, async (request, response) => {
  try {
    const body = request.body || {};
    const paymentId = String(body.paymentId || `test-${Date.now()}`);
    const status = String(body.status || "approved");
    const paymentMethod = String(body.paymentMethod || "pix");
    const amount = Number(body.valor || body.amount || 149.99);
    const approvedAt = status === "approved" ? new Date().toISOString() : null;

    const paymentData = {
      id: paymentId,
      status,
      status_detail: body.statusDetail || "accredited",
      transaction_amount: amount,
      date_approved: body.dateApproved || approvedAt,
      payment_method_id: paymentMethod === "boleto" ? "bolbradesco" : paymentMethod,
      external_reference: body.externalReference || `webhook-test-${paymentId}`,
      metadata: {
        plan_id: body.planId || "premium",
        plan_name: body.planName || "Facilita Premium",
        service_code: body.serviceCode || "bot_whatsapp_premium",
        customer_name: body.nome || body.name || "Cliente Teste Webhook",
        customer_email: body.email || `webhook-${paymentId}@teste.local`,
        customer_phone: normalizeDigits(body.telefone || body.phone || "67999999999"),
        customer_document: normalizeDigits(body.documento || body.document || "41952830000104"),
        payment_method: paymentMethod,
      },
      payer: {
        email: body.email || `webhook-${paymentId}@teste.local`,
        first_name: body.nome || body.name || "Cliente Teste Webhook",
        phone: {
          number: normalizeDigits(body.telefone || body.phone || "67999999999"),
        },
        identification: {
          type: getDocumentType(normalizeDigits(body.documento || body.document || "41952830000104")),
          number: normalizeDigits(body.documento || body.document || "41952830000104"),
        },
      },
    };

    storePayment(paymentData);
    const localPaymentId = await updatePaymentStatus(paymentData);

    const [rows] = await dbPool.execute(
      `SELECT p.id, p.user_id, p.mercado_pago_payment_id, p.gateway, p.gateway_payment_id, p.valor, p.status, p.data_pagamento, p.competencia,
              u.nome, u.email, u.status AS user_status
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = :localPaymentId
       LIMIT 1`,
      { localPaymentId },
    );

    response.json({
      ok: true,
      message: "Webhook de pagamento simulado e salvo com sucesso.",
      paymentId,
      localPaymentId,
      payment: rows[0] || null,
    });
  } catch (error) {
    console.error("Erro ao simular webhook Mercado Pago:", error);
    response.status(500).json({ error: error.message || "Erro ao simular webhook." });
  }
});

app.get("/", (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.get(["/areaadmin", "/areaadmin/"], (_request, response) => {
  response.sendFile(path.join(__dirname, "areaadmin", "index.html"));
});

app.get(["/inicio", "/servicos", "/planos", "/checkout", "/atendimento"], (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _request, response, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError || /arquivo/i.test(error.message || "")) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "Arquivo acima do limite de 12 MB." : error.message;
    return response.status(400).json({ error: message || "Erro no upload do arquivo." });
  }
  return next(error);
});

app.use((error, request, response, next) => {
  if (!error) return next();
  if (response.headersSent) return next(error);
  const status = Number(error.status || 500);
  if (status >= 500) void sendOperationalAlert("unhandled_http_error", {
    requestId: request.requestId,
    path: request.path,
    message: error.message,
  });
  response.status(status).json({ error: status >= 500 ? "Erro interno do servidor." : error.message });
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Rota nao encontrada." });
});

app.get("*", (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

async function startServer() {
  assertProductionConfig();
  if (isProduction && !String(process.env.CLAMAV_HOST || "").trim()) {
    console.warn("CLAMAV_HOST ausente: a API iniciara, mas uploads de documentos serao recusados ate o antivirus ser configurado.");
  }
  await sessionStore.connect();
  await rateLimitStore.connect();

  return app.listen(port, () => {
    console.log(`Facilita Modern API em ${apiPublicUrl}`);
  });
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  startServer().catch((error) => {
    console.error("Nao foi possivel iniciar o servidor:", error);
    process.exitCode = 1;
  });
}

const testSupport = Object.freeze({
  assertMoneyMatches,
  getBoletoExpirationDate,
  getMercadoPagoWebhookDescriptor,
  resolveUserFinancialStatus,
  hashPassword,
  hasClientDasAccess,
  isMercadoPagoSignatureValid,
  mercadoPagoWebhookUrl,
  safeCompare,
  verifyPassword,
});

export { app, startServer, testSupport };
