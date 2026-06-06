import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

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
      "script-src 'self' https://sdk.mercadopago.com",
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
app.get("/styles.css", (_request, response) => {
  response.sendFile(path.join(__dirname, "styles.css"));
});
app.get("/app.js", (_request, response) => {
  response.sendFile(path.join(__dirname, "app.js"));
});

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

  if (userId) {
    const [rows] = await dbPool.execute("SELECT id FROM users WHERE id = :userId LIMIT 1", { userId });
    if (rows[0]?.id) return rows[0].id;
  }

  const [result] = await dbPool.execute(
    `INSERT INTO users (nome, email, telefone, documento, status)
     VALUES (:name, :email, :phone, :documentNumber, 'pending')
     ON DUPLICATE KEY UPDATE
       nome = VALUES(nome),
       telefone = VALUES(telefone),
       documento = VALUES(documento),
       updated_at = CURRENT_TIMESTAMP`,
    { name, email, phone: phoneNumber, documentNumber },
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
  await dbPool.execute(
    `INSERT INTO payments
      (mercado_pago_payment_id, user_id, subscription_id, valor, status, data_pagamento, raw_payload)
     VALUES
      (:paymentId, :customerId, NULL, :amount, :status, :paidAt, :rawPayload)
     ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      data_pagamento = VALUES(data_pagamento),
      raw_payload = VALUES(raw_payload)`,
    {
      paymentId: String(paymentData.id),
      customerId,
      amount: plan.price,
      status: paymentData.status || "pending",
      paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
      rawPayload: JSON.stringify(paymentData),
    },
  );

  await updateUserStatusFromPayment(customerId, paymentData.status);
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
         data_pagamento = :paidAt,
         raw_payload = :rawPayload
     WHERE mercado_pago_payment_id = :paymentId`,
    {
      paymentId: String(paymentData.id),
      status: paymentData.status || "pending",
      paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
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
        metadata.mercado_pago_subscription_id || metadata.subscription_id || metadata.preapproval_id || null;
      let subscriptionId = null;

      if (subscriptionRef) {
        const [subscriptionRows] = await dbPool.execute(
          "SELECT id FROM subscriptions WHERE mercado_pago_subscription_id = :subscriptionRef LIMIT 1",
          { subscriptionRef },
        );
        subscriptionId = subscriptionRows[0]?.id || null;
      }

      await dbPool.execute(
        `INSERT INTO payments
          (user_id, subscription_id, mercado_pago_payment_id, valor, status, data_pagamento, raw_payload)
         VALUES
          (:userId, :subscriptionId, :paymentId, :amount, :status, :paidAt, :rawPayload)
         ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          data_pagamento = VALUES(data_pagamento),
          raw_payload = VALUES(raw_payload)`,
        {
          userId,
          subscriptionId,
          paymentId: String(paymentData.id),
          amount: Number(paymentData.transaction_amount || 0),
          status: paymentData.status || "pending",
          paidAt: paymentData.date_approved ? new Date(paymentData.date_approved) : null,
          rawPayload: JSON.stringify(paymentData),
        },
      );
    }
  }

  const [rows] = await dbPool.execute(
    "SELECT user_id FROM payments WHERE mercado_pago_payment_id = :paymentId LIMIT 1",
    { paymentId: String(paymentData.id) },
  );
  await updateUserStatusFromPayment(rows[0]?.user_id, paymentData.status);
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
