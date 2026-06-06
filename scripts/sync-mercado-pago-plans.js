import "dotenv/config";
import mysql from "mysql2/promise";

const siteUrl = process.env.SITE_URL || "http://localhost:3000";
const mercadoPagoBackUrl = process.env.MERCADO_PAGO_BACK_URL || siteUrl;
const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

if (!accessToken || accessToken.includes("SEU_ACCESS_TOKEN_AQUI")) {
  console.error("Configure MERCADO_PAGO_ACCESS_TOKEN no arquivo .env antes de sincronizar os planos.");
  process.exit(1);
}

const dbPool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "facilita_modern",
  waitForConnections: true,
  connectionLimit: 5,
  namedPlaceholders: true,
});

async function createMercadoPagoPlan(plan) {
  const response = await fetch("https://api.mercadopago.com/preapproval_plan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: plan.nome,
      auto_recurring: {
        frequency: Number(plan.frequencia || 1),
        frequency_type: plan.tipo_frequencia || "months",
        transaction_amount: Number(plan.valor),
        currency_id: "BRL",
      },
      back_url: `${mercadoPagoBackUrl}/?subscription_plan=${plan.id}`,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Erro HTTP ${response.status}`);
  }

  return data;
}

async function main() {
  const [plans] = await dbPool.execute(
    `SELECT id, nome, valor, frequencia, tipo_frequencia, mercado_pago_plan_id
     FROM plans
     WHERE ativo = 1 AND tipo_cobranca = 'subscription'
     ORDER BY ordem ASC, nome ASC`,
  );

  if (!plans.length) {
    console.log("Nenhum plano ativo do tipo subscription encontrado.");
    return;
  }

  for (const plan of plans) {
    if (plan.mercado_pago_plan_id) {
      console.log(`${plan.id}: ja sincronizado (${plan.mercado_pago_plan_id})`);
      continue;
    }

    try {
      const mercadoPagoPlan = await createMercadoPagoPlan(plan);
      await dbPool.execute(
        `UPDATE plans
         SET mercado_pago_plan_id = :mercadoPagoPlanId,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :planId`,
        {
          planId: plan.id,
          mercadoPagoPlanId: mercadoPagoPlan.id,
        },
      );
      console.log(`${plan.id}: criado no Mercado Pago (${mercadoPagoPlan.id})`);
    } catch (error) {
      console.error(`${plan.id}: ${error.message}`);
    }
  }
}

try {
  await main();
} finally {
  await dbPool.end();
}
