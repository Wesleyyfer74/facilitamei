import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { createNfseService, getNfseConfig, registerNfseRoutes } from "./nfse/index.js";
import { CnpjServiceError, createCnpjService } from "./src/services/cnpj/cnpjService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const nfseService = createNfseService({ dbPool });
const cnpjService = createCnpjService({ dbPool });

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

app.post("/api/cnpj/consultar", async (request, response) => {
  try {
    const { cnpj, email, whatsapp, nome } = request.body || {};
    const cliente = await cnpjService.salvarOuAtualizarClientePorCnpj({ cnpj, email, whatsapp, nome });

    response.json({
      ok: true,
      cliente,
    });
  } catch (error) {
    if (error instanceof CnpjServiceError) {
      console.warn("Falha controlada ao consultar CNPJ:", {
        code: error.code,
        status: error.status,
      });

      return response.status(error.status).json({
        ok: false,
        error: error.message,
        code: error.code,
      });
    }

    console.error("Erro inesperado ao consultar CNPJ:", {
      message: error.message,
      code: error.code,
    });

    response.status(500).json({
      ok: false,
      error: "Erro interno ao consultar CNPJ.",
    });
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
          SUM(status = 'cancelled') AS cancelled
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
          SUM(status = 'approved') AS approved,
          SUM(status IN ('pending', 'in_process')) AS pending,
          SUM(status IN ('rejected', 'cancelled', 'refunded', 'charged_back')) AS failed
         FROM payments`,
      ),
      dbPool.execute(
        `SELECT id, nome, email, telefone, status, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT 8`,
      ),
      dbPool.execute(
        `SELECT p.id, p.valor, p.status, p.data_pagamento, p.created_at, u.nome AS user_name, u.email
         FROM payments p
         JOIN users u ON u.id = p.user_id
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

    if (!users[0]) return response.status(404).json({ error: "Cliente nao encontrado." });
    response.json({ customer: users[0], subscriptions, payments });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar cliente." });
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

app.get("/api/admin/plans", requireAdminSession, async (_request, response) => {
  try {
    const [plans] = await dbPool.execute(
      `SELECT id, nome, descricao, valor, frequencia, tipo_frequencia, servico, mercado_pago_plan_id, tipo_cobranca, ativo, ordem
       FROM plans
       ORDER BY ordem ASC, nome ASC`,
    );

    response.json({ plans });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao listar planos." });
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
      statusFilter = "WHERE p.status = :status";
      params.status = status;
    }

    const [payments] = await dbPool.execute(
      `SELECT p.*, u.nome AS user_name, u.email
       FROM payments p
       JOIN users u ON u.id = p.user_id
       ${statusFilter}
       ORDER BY p.created_at DESC
       LIMIT 160`,
      params,
    );

    response.json({ payments });
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

registerNfseRoutes(app, { nfseService, requireAdminSession });

app.post("/api/testes/nfse/fluxo-completo", async (request, response) => {
  if (process.env.NODE_ENV === "production") {
    return response.status(403).json({
      ok: false,
      error: "Rota de teste NFS-e indisponivel em producao.",
    });
  }

  const nfseConfig = getNfseConfig();
  if (!nfseConfig.mock) {
    return response.status(403).json({
      ok: false,
      error: "Fluxo de teste exige NFSE_MOCK=true para evitar envio real.",
    });
  }

  const connection = await dbPool.getConnection();

  try {
    const { cnpj, email, whatsapp, planoId } = request.body || {};

    if (!cnpj || !email || !whatsapp || !planoId) {
      return response.status(400).json({
        ok: false,
        error: "Informe cnpj, email, whatsapp e planoId.",
      });
    }

    const cliente = await cnpjService.salvarOuAtualizarClientePorCnpj({
      cnpj,
      email,
      whatsapp,
      nome: "Cliente Teste NFS-e",
    });

    const [planRows] = await dbPool.execute(
      `SELECT id, nome, valor, descricao_nfse, ativo
       FROM plans
       WHERE id = :planoId
       LIMIT 1`,
      { planoId },
    );
    const plano = planRows[0];

    if (!plano) {
      return response.status(404).json({
        ok: false,
        error: "Plano de teste nao encontrado.",
      });
    }

    if (!Number(plano.valor)) {
      return response.status(400).json({
        ok: false,
        error: "Plano precisa ter valor para gerar NFS-e.",
      });
    }

    await connection.beginTransaction();

    const testRunId = crypto.randomUUID();
    const gatewaySubscriptionId = `teste-nfse-sub-${testRunId}`;
    const gatewayPaymentId = `teste-nfse-pay-${testRunId}`;
    const now = new Date();
    const competencia = now.toISOString().slice(0, 7);

    const [subscriptionResult] = await connection.execute(
      `INSERT INTO subscriptions
        (
          user_id, plan_id, mercado_pago_subscription_id, gateway, gateway_subscription_id,
          status, valor, data_inicio, metodo_pagamento, raw_payload
        )
       VALUES
        (
          :clienteId, :planoId, :gatewaySubscriptionId, 'teste_nfse', :gatewaySubscriptionId,
          'active', :valor, :dataInicio, 'teste_nfse', :rawPayload
        )`,
      {
        clienteId: cliente.id,
        planoId: plano.id,
        gatewaySubscriptionId,
        valor: Number(plano.valor),
        dataInicio: now,
        rawPayload: JSON.stringify({ testRunId, origem: "api/testes/nfse/fluxo-completo" }),
      },
    );

    const [paymentResult] = await connection.execute(
      `INSERT INTO payments
        (
          user_id, subscription_id, mercado_pago_payment_id, gateway, gateway_payment_id,
          valor, status, data_pagamento, competencia, raw_payload
        )
       VALUES
        (
          :clienteId, :subscriptionId, :gatewayPaymentId, 'teste_nfse', :gatewayPaymentId,
          :valor, 'approved', :dataPagamento, :competencia, :rawPayload
        )`,
      {
        clienteId: cliente.id,
        subscriptionId: subscriptionResult.insertId,
        gatewayPaymentId,
        valor: Number(plano.valor),
        dataPagamento: now,
        competencia,
        rawPayload: JSON.stringify({ testRunId, origem: "api/testes/nfse/fluxo-completo" }),
      },
    );

    await connection.commit();

    const emissao = await nfseService.criarNfseParaPagamento(paymentResult.insertId);
    const emissaoDuplicada = await nfseService.criarNfseParaPagamento(paymentResult.insertId);
    const xmlDps = await nfseService.getFiscalNoteXml(emissao.id, "xml_dps");

    response.json({
      ok: true,
      mock: true,
      checklist: {
        cnpjClienteValido: Boolean(cliente.cnpj && cliente.cnpj.length === 14),
        clienteSalvoComRazaoSocial: Boolean(cliente.razao_social),
        planoSalvoComValor: Boolean(Number(plano.valor)),
        pagamentoAprovadoSalvo: Boolean(paymentResult.insertId),
        emissaoCriada: Boolean(emissao.id),
        xmlDpsGerado: Boolean(xmlDps),
        emissaoDuplicadaBloqueada: emissao.id === emissaoDuplicada.id,
      },
      cliente,
      plano: {
        id: plano.id,
        nome: plano.nome,
        valor: Number(plano.valor),
      },
      assinatura: {
        id: subscriptionResult.insertId,
        gatewaySubscriptionId,
      },
      pagamento: {
        id: paymentResult.insertId,
        gatewayPaymentId,
        status: "approved",
        valor: Number(plano.valor),
        competencia,
      },
      emissao: {
        id: emissao.id,
        status: emissao.status,
        numero_dps: emissao.numero_dps,
        numero_nfse: emissao.numero_nfse,
        chave_acesso: emissao.chave_acesso,
        enviada_email: Boolean(emissao.enviada_email),
      },
      duplicidade: {
        primeiraEmissaoId: emissao.id,
        segundaChamadaEmissaoId: emissaoDuplicada.id,
        bloqueada: emissao.id === emissaoDuplicada.id,
      },
      xml: {
        dpsLength: xmlDps.length,
        dpsPreview: xmlDps.slice(0, 800),
        downloadUrl: `/api/nfse/${emissao.id}/xml-dps`,
      },
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Erro no fluxo completo de teste NFS-e:", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    response.status(error.status || 500).json({
      ok: false,
      error: error.message || "Erro ao executar fluxo completo NFS-e.",
      code: error.code,
    });
  } finally {
    connection.release();
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

function isApprovedPaymentStatus(status) {
  return ["approved", "paid", "authorized", "accredited"].includes(String(status || "").toLowerCase());
}

async function getPaymentNfseContext(localPaymentId) {
  if (!localPaymentId) return null;

  const [rows] = await dbPool.execute(
    `SELECT
      p.id,
      p.status,
      p.nfse_emitida,
      p.subscription_id,
      u.id AS user_id,
      u.cnpj,
      u.documento
     FROM payments p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = :localPaymentId
     LIMIT 1`,
    { localPaymentId },
  );

  return rows[0] || null;
}

async function maybeGenerateNfseForApprovedPayment(paymentData, localPaymentId) {
  const config = getNfseConfig();
  const gatewayPaymentId = paymentData?.id ? String(paymentData.id) : "";

  if (!config.autoEmitir) {
    console.log("NFS-e automatica desativada. Pagamento salvo sem gerar nota.", {
      gatewayPaymentId,
      localPaymentId,
      nfseMock: config.mock,
      ambiente: config.ambiente,
    });
    return { skipped: true, reason: "NFSE_AUTO_EMITIR=false" };
  }

  if (!isApprovedPaymentStatus(paymentData?.status)) {
    console.log("NFS-e nao gerada: pagamento ainda nao aprovado.", {
      gatewayPaymentId,
      localPaymentId,
      status: paymentData?.status,
    });
    return { skipped: true, reason: "payment_not_approved" };
  }

  const context = await getPaymentNfseContext(localPaymentId);
  if (!context) {
    console.warn("NFS-e nao gerada: pagamento local nao encontrado.", { gatewayPaymentId, localPaymentId });
    return { skipped: true, reason: "local_payment_not_found" };
  }

  if (Number(context.nfse_emitida) === 1) {
    console.log("NFS-e nao gerada: pagamento ja marcado como nota emitida.", { gatewayPaymentId, localPaymentId });
    return { skipped: true, reason: "already_marked" };
  }

  if (!context.subscription_id) {
    console.log("NFS-e nao gerada: pagamento sem assinatura vinculada.", { gatewayPaymentId, localPaymentId });
    return { skipped: true, reason: "subscription_not_linked" };
  }

  const cnpj = normalizeDigits(context.cnpj || context.documento);
  if (cnpj.length !== 14) {
    console.warn("NFS-e nao gerada: cliente sem CNPJ valido.", {
      gatewayPaymentId,
      localPaymentId,
      userId: context.user_id,
    });
    return { skipped: true, reason: "customer_without_valid_cnpj" };
  }

  try {
    const emissao = await nfseService.criarNfseParaPagamento(localPaymentId);
    console.log("NFS-e DPS gerada para pagamento aprovado:", {
      gatewayPaymentId,
      localPaymentId,
      emissaoId: emissao?.id,
      status: emissao?.status,
      numeroDps: emissao?.numero_dps,
      nfseMock: config.mock,
      ambiente: config.ambiente,
    });
    return { created: true, emissao };
  } catch (error) {
    console.error("Falha ao gerar NFS-e para pagamento aprovado. Pagamento foi mantido.", {
      gatewayPaymentId,
      localPaymentId,
      code: error.code,
      status: error.status,
      emissaoId: error.emissaoId,
      message: error.message,
    });
    return { skipped: true, reason: "nfse_error", error: error.message, emissaoId: error.emissaoId };
  }
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

  if (result.insertId) {
    await nfseService.createPendingForSubscriptionSafe(result.insertId);
    return result.insertId;
  }

  const [rows] = await dbPool.execute(
    "SELECT id FROM subscriptions WHERE mercado_pago_subscription_id = :subscriptionId LIMIT 1",
    { subscriptionId: String(subscriptionData.id) },
  );
  const subscriptionId = rows[0]?.id;
  if (subscriptionId) await nfseService.createPendingForSubscriptionSafe(subscriptionId);
  return subscriptionId;
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
  await maybeGenerateNfseForApprovedPayment(paymentData, rows[0]?.id);
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

app.get("/areaadmin", (_request, response) => {
  response.sendFile(path.join(__dirname, "admin", "index.html"));
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
