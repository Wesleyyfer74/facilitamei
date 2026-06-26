import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

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
const adminSessionDurationMs = 1000 * 60 * 60 * 8;
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

function deleteExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) adminSessions.delete(token);
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
          email: hasValue(process.env.EMAIL_HOST) && hasValue(process.env.EMAIL_USER),
        },
      },
      integrations: {
        mercadoPago: hasValue(process.env.MERCADO_PAGO_ACCESS_TOKEN) && hasValue(process.env.MERCADO_PAGO_PUBLIC_KEY),
        whatsapp: hasValue(process.env.WHATSAPP_PHONE) || hasValue(process.env.WHATSAPP_URL),
        email: hasValue(process.env.EMAIL_HOST) && hasValue(process.env.EMAIL_USER),
        webhooks: hasValue(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
      },
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar configuracoes." });
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
    await saveSubscriptionRecord({ customerId, plan, subscriptionData: data, paymentMethod: "card" });

    response.json({
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
    await saveSubscriptionRecord({ customerId, plan, subscriptionData: data, paymentMethod: "pix_auto" });

    response.json({
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

app.listen(port, () => {
  console.log(`Facilita Modern API em ${apiPublicUrl}`);
});
