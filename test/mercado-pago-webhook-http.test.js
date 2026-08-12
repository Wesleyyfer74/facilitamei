import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.MERCADO_PAGO_WEBHOOK_SECRET = "segredo-webhook-de-teste";
delete process.env.REDIS_URL;
const { app, testSupport } = await import("../server.js");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("contrato do webhook Mercado Pago", () => {
  test("classifica pagamentos e assinaturas usando o recurso notificado", () => {
    const payment = testSupport.getMercadoPagoWebhookDescriptor({
      query: { type: "payment", "data.id": "pay-1" },
      body: {},
    });
    const subscription = testSupport.getMercadoPagoWebhookDescriptor({
      query: {},
      body: { action: "preapproval.updated", data: { id: "sub-1" } },
    });

    assert.deepEqual(payment, { type: "payment", topic: "payment", action: "", resourceId: "pay-1" });
    assert.deepEqual(subscription, {
      type: "subscription",
      topic: "preapproval.updated",
      action: "preapproval.updated",
      resourceId: "sub-1",
    });
  });

  test("aceita data_id e URL resource dos formatos de notificacao", () => {
    const dataId = testSupport.getMercadoPagoWebhookDescriptor({ query: { type: "payment", data_id: "pay-2" }, body: {} });
    const resource = testSupport.getMercadoPagoWebhookDescriptor({
      query: { topic: "payment" }, body: { resource: "https://api.mercadopago.com/v1/payments/pay-3" },
    });
    assert.equal(dataId.resourceId, "pay-2");
    assert.equal(resource.resourceId, "pay-3");
  });

  test("usa uma URL canonica para notificacoes", () => {
    const url = new URL(testSupport.mercadoPagoWebhookUrl);
    assert.equal(url.pathname, "/api/webhooks/mercadopago");
    assert.equal(url.search, "");
  });

  test("recusa pagamento e assinatura sem assinatura HMAC", async () => {
    for (const body of [
      { type: "payment", data: { id: "pay-1" } },
      { type: "subscription_preapproval", data: { id: "sub-1" } },
    ]) {
      const response = await fetch(`${baseUrl}/api/webhooks/mercadopago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 401);
    }
  });

  test("ignora tipo desconhecido sem produzir efeito", async () => {
    const response = await fetch(`${baseUrl}/api/webhooks/mercadopago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unknown", data: { id: "unknown-1" } }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ignored, true);
  });
});
