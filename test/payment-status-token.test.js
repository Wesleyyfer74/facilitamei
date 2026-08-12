import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PAYMENT_STATUS_TOKEN_TTL_MS,
  createPaymentStatusToken,
  hashPaymentStatusToken,
} from "../src/services/paymentStatusTokenService.js";

describe("token de acompanhamento de pagamento", () => {
  test("gera segredo aleatorio e armazena somente hash", () => {
    const first = createPaymentStatusToken();
    const second = createPaymentStatusToken();
    assert.match(first.token, /^[a-f0-9]{64}$/);
    assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(first.tokenHash, hashPaymentStatusToken(first.token));
    assert.notEqual(first.token, first.tokenHash);
    assert.notEqual(first.token, second.token);
  });

  test("expira em 24 horas", () => {
    const before = Date.now();
    const statusToken = createPaymentStatusToken();
    const after = Date.now();
    assert.ok(statusToken.expiresAt.getTime() >= before + PAYMENT_STATUS_TOKEN_TTL_MS);
    assert.ok(statusToken.expiresAt.getTime() <= after + PAYMENT_STATUS_TOKEN_TTL_MS);
  });
});
