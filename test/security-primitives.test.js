import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, describe, test } from "node:test";
import { testSupport } from "../server.js";

const originalWebhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
const originalFallbackSecret = process.env.WEBHOOK_SECRET;

afterEach(() => {
  if (originalWebhookSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  else process.env.MERCADO_PAGO_WEBHOOK_SECRET = originalWebhookSecret;

  if (originalFallbackSecret === undefined) delete process.env.WEBHOOK_SECRET;
  else process.env.WEBHOOK_SECRET = originalFallbackSecret;
});

function webhookRequest(headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );

  return {
    get(name) {
      return normalizedHeaders[String(name).toLowerCase()] || "";
    },
  };
}

describe("senhas", () => {
  test("gera salt unico e valida somente a senha correta", () => {
    const first = testSupport.hashPassword("Senha forte 123!");
    const second = testSupport.hashPassword("Senha forte 123!");

    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.hash, second.hash);
    assert.equal(testSupport.verifyPassword("Senha forte 123!", first.hash, first.salt), true);
    assert.equal(testSupport.verifyPassword("senha errada", first.hash, first.salt), false);
  });

  test("comparacao segura recusa valores diferentes e tamanhos diferentes", () => {
    assert.equal(testSupport.safeCompare("valor", "valor"), true);
    assert.equal(testSupport.safeCompare("valor", "outro"), false);
    assert.equal(testSupport.safeCompare("curto", "valor muito maior"), false);
  });
});

describe("assinatura Mercado Pago", () => {
  test("aceita assinatura HMAC valida", () => {
    const secret = "segredo-webhook-de-teste";
    const resourceId = "123456789";
    const requestId = "request-abc";
    const timestamp = "1723046400";
    const manifest = `id:${resourceId};request-id:${requestId};ts:${timestamp};`;
    const signature = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;

    const request = webhookRequest({
      "x-request-id": requestId,
      "x-signature": `ts=${timestamp},v1=${signature}`,
    });

    assert.equal(testSupport.isMercadoPagoSignatureValid(request, resourceId), true);
  });

  test("normaliza data.id para minusculas conforme o manifesto do Mercado Pago", () => {
    const secret = "segredo-webhook-de-teste";
    const resourceId = "ABC-123";
    const requestId = "request-uppercase";
    const timestamp = "1723046400";
    const manifest = `id:${resourceId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
    const signature = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;
    assert.equal(testSupport.isMercadoPagoSignatureValid(webhookRequest({
      "x-request-id": requestId, "x-signature": `ts=${timestamp},v1=${signature}`,
    }), resourceId), true);
  });

  test("recusa assinatura adulterada ou incompleta quando ha segredo", () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = "segredo-webhook-de-teste";

    assert.equal(
      testSupport.isMercadoPagoSignatureValid(
        webhookRequest({ "x-request-id": "request-abc", "x-signature": "ts=1723046400,v1=adulterada" }),
        "123456789",
      ),
      false,
    );
    assert.equal(testSupport.isMercadoPagoSignatureValid(webhookRequest(), "123456789"), false);
  });

  test("recusa webhook quando o segredo nao esta configurado", () => {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SECRET;
    assert.equal(testSupport.isMercadoPagoSignatureValid(webhookRequest(), "123456789"), false);
  });

  test("valida valores monetarios com tolerancia apenas de centavos", () => {
    assert.doesNotThrow(() => testSupport.assertMoneyMatches(99.99, "99.99", "divergente"));
    assert.throws(() => testSupport.assertMoneyMatches(90, 99.99, "divergente"), /divergente/);
    assert.throws(() => testSupport.assertMoneyMatches("invalido", 99.99, "divergente"), /divergente/);
  });
});
