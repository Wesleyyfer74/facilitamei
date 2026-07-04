import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { DAS_MEI_FACILITA_CNPJ, gerarDasMei, montarPayloadGerarDasMei } from "./src/services/dasMeiService.js";
import { gerarTokenSerpro } from "./src/services/serproAuthService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = Number(process.env.PORT || 3000);
const localUrl = `http://localhost:${port}`;
const railwayPublicUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
const frontendUrl = process.env.FRONTEND_URL || process.env.SITE_URL || localUrl;
const apiPublicUrl = process.env.API_PUBLIC_URL || railwayPublicUrl || frontendUrl;
const mercadoPagoBackUrl = process.env.MERCADO_PAGO_BACK_URL || frontendUrl;
const isProduction = process.env.NODE_ENV === "production";
const paymentStore = new Map();
const adminSessions = new Map();
const clientSessions = new Map();
const adminSessionDurationMs = 1000 * 60 * 60 * 8;
const clientSessionDurationMs = 1000 * 60 * 60 * 24 * 7;
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
const clientEditableUserColumns = {
  razao_social: "VARCHAR(180) NULL",
  nome_fantasia: "VARCHAR(160) NULL",
  data_abertura: "DATE NULL",
  cep: "VARCHAR(12) NULL",
  logradouro: "VARCHAR(180) NULL",
  numero: "VARCHAR(30) NULL",
  complemento: "VARCHAR(120) NULL",
  bairro: "VARCHAR(120) NULL",
  municipio: "VARCHAR(120) NULL",
  uf: "VARCHAR(2) NULL",
  cnae_principal_codigo: "VARCHAR(20) NULL",
  cnae_principal_descricao: "VARCHAR(255) NULL",
  cnae_secundario_codigo: "VARCHAR(80) NULL",
  cnae_secundario_descricao: "VARCHAR(255) NULL",
  capital_social: "DECIMAL(12,2) NULL",
  inscricao_municipal: "VARCHAR(60) NULL",
  inscricao_estadual: "VARCHAR(60) NULL",
  alvara_status: "VARCHAR(80) NULL",
  banco: "VARCHAR(120) NULL",
  agencia: "VARCHAR(30) NULL",
  conta: "VARCHAR(40) NULL",
  tipo_conta: "VARCHAR(40) NULL",
};
const allowedOrigins = new Set([
  frontendUrl,
  apiPublicUrl,
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:80",
  "http://127.0.0.1:80",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.disable("x-powered-by");
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
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origem nao autorizada pelo CORS."));
    },
  }),
);
app.use(express.json());
app.use((error, _request, response, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "JSON invalido no corpo da requisicao." });
  }

  return next(error);
});
app.use((request, response, next) => {
  const blockedPattern =
    /^\/(?:\.env|package(?:-lock)?\.json|server\.js|backend\.log|DEPLOYMENT\.md)$/i;
  const blockedDirectory = /^\/(?:database|docs|scripts|node_modules|\.git|\.agents|\.codex)(?:\/|$)/i;

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
    index: false,
    maxAge: isProduction ? "30d" : 0,
  }),
);
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

function createAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + adminSessionDurationMs;

  adminSessions.set(token, { expiresAt });
  return { token, expiresAt };
}

function createClientSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + clientSessionDurationMs;

  clientSessions.set(token, {
    userId: user.id,
    email: user.email,
    expiresAt,
  });
  return { token, expiresAt };
}

function deleteExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) adminSessions.delete(token);
  }
}

function deleteExpiredClientSessions() {
  const now = Date.now();
  for (const [token, session] of clientSessions.entries()) {
    if (session.expiresAt <= now) clientSessions.delete(token);
  }
}

function setAdminCookie(response, token, expiresAt) {
  const cookieParts = [
    `facilita_admin=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  if (isProduction) cookieParts.push("Secure");
  response.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearAdminCookie(response) {
  const cookieParts = [
    "facilita_admin=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (isProduction) cookieParts.push("Secure");
  response.setHeader("Set-Cookie", cookieParts.join("; "));
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

async function ensureClientEditableUserFields() {
  const databaseName = process.env.DB_NAME || "facilita_modern";
  try {
    const [rows] = await dbPool.execute(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = :databaseName
         AND TABLE_NAME = 'users'`,
      { databaseName },
    );
    const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME));
    const missingColumns = Object.entries(clientEditableUserColumns).filter(([column]) => !existingColumns.has(column));

    for (const [column, definition] of missingColumns) {
      await dbPool.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    }

    if (missingColumns.length) {
      console.log(`Campos editaveis do cliente criados: ${missingColumns.map(([column]) => column).join(", ")}`);
    }
  } catch (error) {
    console.warn("Nao foi possivel garantir campos editaveis do cliente.", error.message);
  }
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

async function vincularCnpjAoCliente({ customerId, subscriptionId, email, cnpj }) {
  const cleanEmailValue = cleanEmail(email);
  const cleanCnpj = normalizeDigits(cnpj);

  if (!customerId || !subscriptionId || !cleanEmailValue) {
    const error = new Error("Cliente, assinatura e e-mail sao obrigatorios para vincular o CNPJ.");
    error.status = 400;
    throw error;
  }

  const [rows] = await dbPool.execute(
    `SELECT u.id, u.email, u.telefone, u.whatsapp
     FROM users u
     JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = :customerId
       AND s.id = :subscriptionId
       AND LOWER(u.email) = :email
     LIMIT 1`,
    { customerId, subscriptionId, email: cleanEmailValue },
  );

  const user = rows[0];
  if (!user) {
    const error = new Error("Nao foi possivel confirmar a assinatura para este cliente.");
    error.status = 404;
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

function requireAdminSession(request, response, next) {
  deleteExpiredAdminSessions();

  const authorization = request.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = bearerToken || parseCookies(request.get("cookie") || "").facilita_admin;
  const session = token ? adminSessions.get(token) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (token) adminSessions.delete(token);
    return response.status(401).json({ error: "Sessao administrativa expirada. Faça login novamente." });
  }

  session.expiresAt = Date.now() + adminSessionDurationMs;
  setAdminCookie(response, token, session.expiresAt);
  request.adminSession = session;
  return next();
}

function requireClientSession(request, response, next) {
  deleteExpiredClientSessions();

  const authorization = request.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const session = bearerToken ? clientSessions.get(bearerToken) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (bearerToken) clientSessions.delete(bearerToken);
    return response.status(401).json({ error: "Sessao do cliente expirada. Faca login novamente." });
  }

  session.expiresAt = Date.now() + clientSessionDurationMs;
  request.clientSession = session;
  return next();
}

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

let customerDocumentFilesReady = false;

async function ensureCustomerDocumentFilesTable() {
  if (customerDocumentFilesReady) return;

  await dbPool.execute(`
    CREATE TABLE IF NOT EXISTS customer_document_files (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      document_id BIGINT UNSIGNED NOT NULL,
      file_name VARCHAR(180) NOT NULL,
      mime_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
      base64_data MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY customer_document_files_document_unique (document_id),
      CONSTRAINT customer_document_files_document_fk FOREIGN KEY (document_id) REFERENCES customer_documents(id) ON DELETE CASCADE
    )
  `);

  customerDocumentFilesReady = true;
}

function formatDasCompetencia(periodoApuracao = "") {
  const period = String(periodoApuracao || "");
  if (!/^\d{6}$/.test(period)) return period || "DAS-MEI";
  return `${period.slice(4, 6)}/${period.slice(0, 4)}`;
}

function parseSerproDate(value = "") {
  const digits = normalizeDigits(value);
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

async function saveDasDocumentForClient({ userId, periodoApuracao, cnpjContribuinte, dasData, pdfBase64 }) {
  await ensureCustomerDocumentFilesTable();

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

  await dbPool.execute(
    `INSERT INTO customer_document_files (document_id, file_name, mime_type, base64_data)
     VALUES (:documentId, :fileName, 'application/pdf', :pdfBase64)
     ON DUPLICATE KEY UPDATE
       file_name = VALUES(file_name),
       mime_type = VALUES(mime_type),
       base64_data = VALUES(base64_data),
       updated_at = CURRENT_TIMESTAMP`,
    {
      documentId,
      fileName,
      pdfBase64,
    },
  );

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

app.post("/api/das-mei/gerar", async (request, response) => {
  try {
    const resposta = await gerarDasMei({
      cnpjContribuinte: request.body?.cnpjContribuinte,
      periodoApuracao: request.body?.periodoApuracao,
    });

    response.json({ ok: true, resposta });
  } catch (error) {
    const status = error.status || 500;

    response.status(status).json({
      ok: false,
      status,
      mensagem: getSerproDasErrorMessage(status),
      erro: error.details || error.message || "Erro desconhecido ao gerar DAS-MEI.",
    });
  }
});

app.post("/api/client/das-mei/gerar", requireClientSession, async (request, response) => {
  try {
    const periodoApuracao = request.body?.periodoApuracao || getDefaultDasPeriodoApuracao();
    const [rows] = await dbPool.execute(
      `SELECT id, nome, cnpj, documento
       FROM users
       WHERE id = :userId
       LIMIT 1`,
      { userId: request.clientSession.userId },
    );
    const client = rows[0];
    const cnpjContribuinte = normalizeDigits(client?.cnpj || client?.documento || "");

    if (!client) return response.status(404).json({ error: "Cliente nao encontrado." });
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
      `SELECT d.id, d.user_id, d.titulo, f.file_name, f.mime_type, f.base64_data
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

    const buffer = Buffer.from(String(document.base64_data || ""), "base64");
    response.setHeader("Content-Type", document.mime_type || "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${String(document.file_name || "documento.pdf").replace(/"/g, "")}"`);
    response.send(buffer);
  } catch (error) {
    console.error("Erro ao baixar documento do cliente:", error);
    response.status(500).json({ error: "Erro ao baixar documento." });
  }
});

app.get("/api/serpro/token/teste", async (_request, response) => {
  try {
    const tokenData = await gerarTokenSerpro();
    const accessToken = String(tokenData.access_token || "");

    response.json({
      ok: true,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      access_token_preview: accessToken ? `${accessToken.slice(0, 20)}...` : "",
    });
  } catch (error) {
    response.status(error.status || 500).json({
      ok: false,
      erro: error.message || "Nao foi possivel gerar token Serpro.",
    });
  }
});

app.post("/api/customers/cnpj", async (request, response) => {
  try {
    const body = request.body || {};
    const customerId = Number(body.customerId || body.userId);
    const subscriptionId = Number(body.subscriptionId || body.localSubscriptionId);
    const email = body.email;
    const cnpj = body.cnpj;
    const cnpjData = await vincularCnpjAoCliente({ customerId, subscriptionId, email, cnpj });

    response.json({
      ok: true,
      message: "CNPJ vinculado e dados publicos salvos com sucesso.",
      company: cnpjData,
    });
  } catch (error) {
    console.error("Erro ao vincular CNPJ:", error.message);
    response.status(error.status || 500).json({ error: error.message || "Erro ao consultar CNPJ." });
  }
});

app.post("/api/client/auth/setup", async (request, response) => {
  try {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const documento = normalizeDigits(request.body?.documento || "");
    const password = String(request.body?.password || "");

    if (!email) return response.status(400).json({ error: "Informe o e-mail usado na assinatura." });
    if (!documento) return response.status(400).json({ error: "Informe o CPF ou CNPJ usado na assinatura." });
    if (password.length < 8) return response.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });

    const [users] = await dbPool.execute(
      `SELECT id, nome, email, documento, cnpj, cliente_login_ativo
       FROM users
       WHERE LOWER(email) = :email
       LIMIT 1`,
      { email },
    );
    const user = users[0];

    if (!user) return response.status(404).json({ error: "Nao encontramos uma assinatura com este e-mail." });
    if (Number(user.cliente_login_ativo) === 0) return response.status(403).json({ error: "O acesso deste cliente esta bloqueado. Fale com o atendimento." });

    const storedDocuments = [user.documento, user.cnpj].map(normalizeDigits).filter(Boolean);
    if (!storedDocuments.includes(documento)) {
      return response.status(401).json({ error: "Documento nao confere com o cadastro da assinatura." });
    }

    const [[accessRows], [subscriptionRows]] = await Promise.all([
      dbPool.execute(
        `SELECT COUNT(*) AS total
         FROM payments
         WHERE user_id = :userId
           AND status IN ('approved', 'paid', 'pago')`,
        { userId: user.id },
      ),
      dbPool.execute(
        `SELECT COUNT(*) AS total
         FROM subscriptions
         WHERE user_id = :userId
           AND status IN ('pending', 'authorized', 'active')`,
        { userId: user.id },
      ),
    ]);

    if (!Number(accessRows[0]?.total || 0) && !Number(subscriptionRows[0]?.total || 0)) {
      return response.status(403).json({ error: "Seu cadastro ainda nao tem assinatura vinculada." });
    }

    const { hash, salt } = hashPassword(password);
    await dbPool.execute(
      `UPDATE users
       SET senha_hash = :hash,
           senha_salt = :salt,
           cliente_login_ativo = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :userId`,
      { hash, salt, userId: user.id },
    );

    const session = createClientSession(user);
    response.json({
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      client: { id: user.id, nome: user.nome, email: user.email },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao criar acesso do cliente." });
  }
});

app.post("/api/client/auth/login", async (request, response) => {
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

    const session = createClientSession(user);
    response.json({
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      client: { id: user.id, nome: user.nome, email: user.email, status: user.status },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao fazer login do cliente." });
  }
});

app.post("/api/client/auth/logout", requireClientSession, (request, response) => {
  const authorization = request.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (bearerToken) clientSessions.delete(bearerToken);
  response.json({ ok: true });
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
    response.json({ client: rows[0] });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar cliente." });
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
      banco: cleanText(request.body?.banco, 120),
      agencia: cleanText(request.body?.agencia, 30),
      conta: cleanText(request.body?.conta, 40),
      tipoConta: cleanText(request.body?.tipo_conta || request.body?.tipoConta, 40),
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
    response.status(500).json({ error: "Erro ao salvar dados bancarios do cliente." });
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
    const client = clientRows[0] || null;
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

app.post("/api/admin/auth/login", (request, response) => {
  const adminEmail = process.env.ADMIN_EMAIL || "Atendimento@facilitameibr.com.br";
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const { email, password } = request.body || {};

  if (!adminPassword) {
    return response.status(503).json({ error: "ADMIN_PASSWORD nao configurada no servidor." });
  }

  const emailMatches = String(email || "").trim().toLowerCase() === adminEmail.toLowerCase();
  const passwordMatches = safeCompare(password || "", adminPassword);

  if (!emailMatches || !passwordMatches) {
    return response.status(401).json({ error: "E-mail ou senha invalidos." });
  }

  const session = createAdminSession();
  setAdminCookie(response, session.token, session.expiresAt);

  response.json({
    token: session.token,
    expiresAt: new Date(session.expiresAt).toISOString(),
    admin: { email: adminEmail },
  });
});

app.post("/api/admin/auth/logout", requireAdminSession, (request, response) => {
  const authorization = request.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const cookieToken = parseCookies(request.get("cookie") || "").facilita_admin;
  const token = bearerToken || cookieToken;

  if (token) adminSessions.delete(token);
  clearAdminCookie(response);
  response.json({ ok: true });
});

app.get("/api/admin/auth/me", requireAdminSession, (_request, response) => {
  response.json({
    admin: { email: process.env.ADMIN_EMAIL || "Atendimento@facilitameibr.com.br" },
  });
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
          SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS newLast30
         FROM users`,
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
          COALESCE(SUM(CASE WHEN status = 'approved' THEN valor ELSE 0 END), 0) AS approvedAmount,
          COALESCE(SUM(CASE WHEN status = 'approved' AND COALESCE(data_pagamento, created_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN valor ELSE 0 END), 0) AS monthlyApprovedAmount,
          COALESCE(AVG(CASE WHEN status = 'approved' THEN valor ELSE NULL END), 0) AS averageApprovedAmount,
          SUM(status = 'approved') AS approved,
          SUM(status IN ('pending', 'in_process')) AS pending,
          SUM(status IN ('rejected', 'cancelled', 'refunded', 'charged_back')) AS failed
         FROM payments`,
      ),
      dbPool.execute(
        `SELECT
           u.id, u.nome, u.email, u.telefone, u.status, u.created_at,
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
         LIMIT 8`,
      ),
      dbPool.execute(
        `SELECT
           p.id, p.valor, p.status, p.data_pagamento, p.created_at,
           u.nome AS user_name, u.email,
           pl.nome AS plan_name
         FROM payments p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
         LEFT JOIN plans pl ON pl.id = s.plan_id
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
        s.status AS subscription_status,
        s.valor AS subscription_value,
        s.data_proxima_cobranca,
        s.mercado_pago_subscription_id,
        pl.id AS plan_id,
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
        `SELECT *
         FROM payments
         WHERE user_id = :userId
         ORDER BY created_at DESC
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

    if (!nome) return response.status(400).json({ error: "Informe o nome do cliente." });
    if (!email || !email.includes("@")) return response.status(400).json({ error: "Informe um e-mail valido para login." });
    if (password.length < 8) return response.status(400).json({ error: "A senha do cliente precisa ter pelo menos 8 caracteres." });

    const { hash, salt } = hashPassword(password);

    const [result] = await dbPool.execute(
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

    const [rows] = await dbPool.execute("SELECT id, nome, email, telefone, documento, status, created_at FROM users WHERE id = :id", {
      id: result.insertId,
    });

    response.status(201).json({ ok: true, customer: rows[0] });
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

  await dbPool.execute(`
    CREATE TABLE IF NOT EXISTS whatsapp_settings (
      id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
      suporte_numero VARCHAR(30) NULL,
      atendimento_numero VARCHAR(30) NULL,
      abrir_mei_numero VARCHAR(30) NULL,
      plataforma_numero VARCHAR(30) NULL,
      lembretes_ativos TINYINT(1) NOT NULL DEFAULT 0,
      lembretes_mensagem_padrao TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await dbPool.execute(
    `INSERT INTO whatsapp_settings
      (id, suporte_numero, atendimento_numero, abrir_mei_numero, plataforma_numero, lembretes_ativos, lembretes_mensagem_padrao)
     VALUES
      (1, NULL, NULL, NULL, NULL, 0, 'Ola {{cliente_nome}}, passando para lembrar sobre sua assinatura Facilita MEI.')
     ON DUPLICATE KEY UPDATE id = id`,
  );

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
    response.json({ settings: await getWhatsappSettings() });
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

  await dbPool.execute(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
      remetente_email VARCHAR(160) NOT NULL DEFAULT 'Atendimento@facilitameibr.com.br',
      remetente_nome VARCHAR(160) NOT NULL DEFAULT 'Facilita MEI',
      smtp_host VARCHAR(160) NULL,
      smtp_port INT NULL,
      smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
      smtp_user VARCHAR(160) NULL,
      smtp_pass_configurado TINYINT(1) NOT NULL DEFAULT 0,
      enviar_certificados TINYINT(1) NOT NULL DEFAULT 1,
      enviar_documentos TINYINT(1) NOT NULL DEFAULT 1,
      enviar_avisos TINYINT(1) NOT NULL DEFAULT 1,
      assinatura_padrao TEXT NULL,
      aviso_rodape TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await dbPool.execute(
    `INSERT INTO email_settings
      (id, remetente_email, remetente_nome, smtp_secure, smtp_pass_configurado,
       enviar_certificados, enviar_documentos, enviar_avisos, assinatura_padrao, aviso_rodape)
     VALUES
      (
        1,
        'Atendimento@facilitameibr.com.br',
        'Facilita MEI',
        1,
        :smtpPassConfigurado,
        1,
        1,
        1,
        'Atenciosamente,\\nFACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA',
        'Este e-mail foi enviado pela Facilita MEI para comunicacoes relacionadas aos servicos contratados.'
      )
     ON DUPLICATE KEY UPDATE id = id`,
    { smtpPassConfigurado: process.env.EMAIL_PASS ? 1 : 0 },
  );

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
         pl.nome AS plan_name
       FROM payments p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN subscriptions s ON s.id = p.subscription_id
       LEFT JOIN plans pl ON pl.id = s.plan_id
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

  if (userId) {
    const [rows] = await dbPool.execute("SELECT id FROM users WHERE id = :userId LIMIT 1", { userId });
    if (rows[0]?.id) return rows[0].id;
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
    { name, email, phone: phoneNumber, documentNumber, cnpj },
  );

  if (result.insertId) return result.insertId;

  const [rows] = await dbPool.execute("SELECT id FROM users WHERE email = :email LIMIT 1", { email });
  return rows[0]?.id;
}

function getUserStatusFromPaymentStatus(status) {
  if (status === "approved") return "active";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(status)) return "blocked";
  return "pending";
}

function getUserStatusFromSubscriptionStatus(status) {
  if (["authorized", "active"].includes(status)) return "active";
  if (status === "cancelled") return "cancelled";
  if (["paused", "expired", "rejected"].includes(status)) return "blocked";
  return "pending";
}

function normalizeSubscriptionStatus(status) {
  const allowedStatuses = ["pending", "authorized", "active", "paused", "cancelled", "expired", "rejected"];
  if (allowedStatuses.includes(status)) return status;
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
  await updateUserStatus(userId, getUserStatusFromPaymentStatus(paymentStatus));
}

async function updateUserStatusFromSubscription(userId, subscriptionStatus) {
  await updateUserStatus(userId, getUserStatusFromSubscriptionStatus(subscriptionStatus));
}

async function savePaymentRecord({ customerId, plan, paymentData, paymentMethod }) {
  const [result] = await dbPool.execute(
    `INSERT INTO payments
      (mercado_pago_payment_id, gateway, gateway_payment_id, user_id, subscription_id, valor, status, data_pagamento, competencia, raw_payload)
     VALUES
      (:paymentId, 'mercado_pago', :paymentId, :customerId, NULL, :amount, :status, :paidAt, :competencia, :rawPayload)
     ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      gateway = VALUES(gateway),
      gateway_payment_id = VALUES(gateway_payment_id),
      data_pagamento = VALUES(data_pagamento),
      competencia = VALUES(competencia),
      raw_payload = VALUES(raw_payload),
      updated_at = CURRENT_TIMESTAMP`,
    {
      paymentId: String(paymentData.id),
      customerId,
      amount: plan.price,
      status: paymentData.status || "pending",
      paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
      competencia: paymentData.date_approved
        ? new Date(paymentData.date_approved).toISOString().slice(0, 7)
        : new Date().toISOString().slice(0, 7),
      rawPayload: JSON.stringify(paymentData),
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
      rawPayload: JSON.stringify(subscriptionData),
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
  const [result] = await dbPool.execute(
    `UPDATE payments
     SET status = :status,
         gateway = 'mercado_pago',
         gateway_payment_id = :paymentId,
         data_pagamento = :paidAt,
         competencia = :competencia,
         raw_payload = :rawPayload,
         updated_at = CURRENT_TIMESTAMP
     WHERE mercado_pago_payment_id = :paymentId`,
    {
      paymentId: String(paymentData.id),
      status: paymentData.status || "pending",
      paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
      competencia: paymentData.date_approved
        ? new Date(paymentData.date_approved).toISOString().slice(0, 7)
        : new Date().toISOString().slice(0, 7),
      rawPayload: JSON.stringify(paymentData),
    },
  );

  if (result.affectedRows === 0) {
    const metadata = paymentData.metadata || {};
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
          (user_id, subscription_id, mercado_pago_payment_id, gateway, gateway_payment_id, valor, status, data_pagamento, competencia, raw_payload)
         VALUES
          (:userId, :subscriptionId, :paymentId, 'mercado_pago', :paymentId, :amount, :status, :paidAt, :competencia, :rawPayload)
         ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          subscription_id = COALESCE(subscription_id, VALUES(subscription_id)),
          gateway = VALUES(gateway),
          gateway_payment_id = VALUES(gateway_payment_id),
          data_pagamento = VALUES(data_pagamento),
          competencia = VALUES(competencia),
          raw_payload = VALUES(raw_payload),
          updated_at = CURRENT_TIMESTAMP`,
        {
          userId,
          subscriptionId,
          paymentId: String(paymentData.id),
          amount: Number(paymentData.transaction_amount || 0),
          status: paymentData.status || "pending",
          paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
          competencia: paymentData.date_approved
            ? new Date(paymentData.date_approved).toISOString().slice(0, 7)
            : new Date().toISOString().slice(0, 7),
          rawPayload: JSON.stringify(paymentData),
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
      rawPayload: JSON.stringify(subscriptionData),
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
    updatedAt: new Date().toISOString(),
  });
}

function getPaymentMessage(status) {
  const messages = {
    approved: "Pagamento aprovado. Obrigado!",
    pending: "Aguardando pagamento Pix.",
    in_process: "Pagamento em analise pelo Mercado Pago.",
    rejected: "Pagamento recusado. Gere um novo Pix ou tente outro metodo.",
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
  if (plan.billing !== "single") {
    throw new Error("Este plano e mensal. Use o fluxo de assinatura recorrente.");
  }
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

  if (!webhookSecret) return true;

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

  const manifest = `id:${paymentId};request-id:${requestId};ts:${signatureParts.ts};`;
  const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureParts.v1));
  } catch {
    return false;
  }
}

app.post("/api/payments/pix", async (request, response) => {
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
        notification_url: `${apiPublicUrl}/api/webhooks/mercadopago`,
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
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      return response.status(mercadoPagoResponse.status).json({
        error: data.message || "Erro ao criar pagamento Pix no Mercado Pago.",
        details: data,
      });
    }

    storePayment(data);
    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    await savePaymentRecord({ customerId, plan, paymentData: data, paymentMethod: "pix" });

    const transactionData = data.point_of_interaction?.transaction_data || {};

    response.json({
      paymentId: data.id,
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

app.post("/api/payments/card", async (request, response) => {
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
        notification_url: `${apiPublicUrl}/api/webhooks/mercadopago`,
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
        error: data.message || "Erro ao criar pagamento com cartao no Mercado Pago.",
        details: data,
      });
    }

    storePayment(data);
    const customerId = await upsertCustomer({ userId, name, email, phone, document });
    await savePaymentRecord({ customerId, plan, paymentData: data, paymentMethod: "card" });

    response.json({
      paymentId: data.id,
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

app.post("/api/subscriptions/card", async (request, response) => {
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

app.post("/api/subscriptions/pix-auto", async (request, response) => {
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

app.get("/api/payments/:id/status", async (request, response) => {
  try {
    const { id } = request.params;
    const client = getMercadoPagoClient();
    const payment = new Payment(client);
    const paymentData = await payment.get({ id });

    storePayment(paymentData);

    response.json({
      id: paymentData.id,
      status: paymentData.status,
      statusDetail: paymentData.status_detail,
      message: getPaymentMessage(paymentData.status),
      metadata: paymentData.metadata,
    });
  } catch (error) {
    const cachedPayment = paymentStore.get(String(request.params.id));

    if (cachedPayment) {
      return response.json({
        ...cachedPayment,
        message: getPaymentMessage(cachedPayment.status),
      });
    }

    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao consultar pagamento." });
  }
});

app.post("/api/checkout", async (request, response) => {
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
        notification_url: `${apiPublicUrl}/api/webhooks/mercadopago`,
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

app.post("/api/subscription", async (request, response) => {
  try {
    return response.status(410).json({
      error: "Rota descontinuada. Use /api/subscriptions/card com planId e cardTokenId para plano associado.",
    });

    const { planId, name, email, phone } = request.body || {};
    const plan = await getPlanById(planId);
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!plan) {
      return response.status(400).json({ error: "Plano invalido." });
    }

    ensureSubscriptionPlan(plan);

    if (!name || !email || !phone) {
      return response.status(400).json({ error: "Nome, e-mail e WhatsApp sao obrigatorios." });
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
        external_reference: `${plan.id}-${Date.now()}`,
        payer_email: email,
        back_url: `${mercadoPagoBackUrl}/?subscription=return#checkout`,
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
        },
      }),
    });

    const data = await mercadoPagoResponse.json();

    if (!mercadoPagoResponse.ok) {
      return response.status(mercadoPagoResponse.status).json({
        error: data.message || "Erro ao criar assinatura no Mercado Pago.",
        details: data,
      });
    }

    const customerId = await upsertCustomer({ userId: null, name, email, phone, document: "" });
    await saveSubscriptionRecord({ customerId, plan, subscriptionData: data, paymentMethod: "mercado_pago" });

    response.json({
      subscriptionId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
      status: data.status,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error.message || "Erro ao criar assinatura." });
  }
});

app.post("/api/webhooks/mercadopago", async (request, response) => {
  try {
    const topic = request.query.topic || request.query.type || request.body.type;
    const action = request.body.action || "";
    const paymentId = request.query.id || request.query["data.id"] || request.body?.data?.id;
    const subscriptionId = request.query.preapproval_id || request.query.id || request.body?.data?.id;
    const isPaymentEvent = topic === "payment" || action.startsWith("payment.");
    const isSubscriptionEvent =
      topic === "subscription_preapproval" || topic === "preapproval" || action.startsWith("preapproval.");

    if (isPaymentEvent && !isMercadoPagoSignatureValid(request, paymentId)) {
      return response.sendStatus(401);
    }

    if (isPaymentEvent && paymentId) {
      const client = getMercadoPagoClient();
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: paymentId });

      storePayment(paymentData);
      await updatePaymentStatus(paymentData);

      console.log("Pagamento Mercado Pago recebido:", {
        id: paymentData.id,
        status: paymentData.status,
        statusDetail: paymentData.status_detail,
        externalReference: paymentData.external_reference,
        metadata: paymentData.metadata,
      });
    }

    if (isSubscriptionEvent && subscriptionId) {
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      const mercadoPagoResponse = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const subscriptionData = await mercadoPagoResponse.json();

      if (mercadoPagoResponse.ok) {
        await updateSubscriptionStatus(subscriptionData);
      }

      console.log("Evento de assinatura Mercado Pago recebido:", {
        id: subscriptionData.id || subscriptionId,
        status: subscriptionData.status,
      });
    }

    response.sendStatus(200);
  } catch (error) {
    console.error(error);
    response.sendStatus(200);
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

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Rota nao encontrada." });
});

app.get("*", (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

ensureClientEditableUserFields().finally(() => {
  app.listen(port, () => {
    console.log(`Facilita Modern API em ${apiPublicUrl}`);
  });
});
