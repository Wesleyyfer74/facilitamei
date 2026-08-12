import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { testSupport } from "../server.js";

describe("liberacao financeira do cliente", () => {
  test("pagamento aprovado libera o cliente", () => {
    assert.equal(testSupport.resolveUserFinancialStatus({
      currentStatus: "pending", hasPaidPayment: true, hasActiveSubscription: false,
    }), "active");
  });

  test("assinatura ativa libera o cliente", () => {
    assert.equal(testSupport.resolveUserFinancialStatus({
      currentStatus: "pending", hasPaidPayment: false, hasActiveSubscription: true,
    }), "active");
  });

  test("nova tentativa pendente ou recusada nao remove acesso ja pago", () => {
    for (const paymentStatus of ["pending", "rejected", "cancelled"]) {
      assert.equal(testSupport.resolveUserFinancialStatus({
        currentStatus: "active", hasPaidPayment: true, hasActiveSubscription: false, paymentStatus,
      }), "active");
    }
  });

  test("estorno bloqueia apenas quando nao resta outra contratacao ativa", () => {
    assert.equal(testSupport.resolveUserFinancialStatus({
      currentStatus: "active", hasPaidPayment: false, hasActiveSubscription: false, paymentStatus: "refunded",
    }), "blocked");
    assert.equal(testSupport.resolveUserFinancialStatus({
      currentStatus: "active", hasPaidPayment: false, hasActiveSubscription: true, paymentStatus: "refunded",
    }), "active");
  });

  test("evento pendente nao desfaz bloqueio administrativo", () => {
    assert.equal(testSupport.resolveUserFinancialStatus({
      currentStatus: "blocked", hasPaidPayment: false, hasActiveSubscription: false, paymentStatus: "pending",
    }), "blocked");
  });
});
