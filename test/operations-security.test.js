import assert from "node:assert/strict";
import test from "node:test";
import { hashAdminPassword, isAdminAuthorized, totp, verifyAdminPassword, verifyTotp } from "../src/services/adminAuthService.js";
import { sendOperationalAlert } from "../src/services/alertService.js";
import { maskSensitive } from "../src/services/structuredLogger.js";

test("senha administrativa usa hash com salt e MFA segue TOTP", () => {
  const stored = hashAdminPassword("senha-administrativa-forte");
  assert.equal(verifyAdminPassword("senha-administrativa-forte", stored.hash, stored.salt), true);
  assert.equal(verifyAdminPassword("senha-errada", stored.hash, stored.salt), false);
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 59000), "287082");
  assert.equal(verifyTotp(secret, "287082", 59000), true);
});

test("papeis administrativos aplicam menor privilegio", () => {
  assert.equal(isAdminAuthorized("viewer", "GET", "/api/admin/dashboard"), true);
  assert.equal(isAdminAuthorized("viewer", "PATCH", "/api/admin/customers/1"), false);
  assert.equal(isAdminAuthorized("support", "POST", "/api/admin/customers/1/documents"), true);
  assert.equal(isAdminAuthorized("support", "PATCH", "/api/admin/plans/mei"), false);
  assert.equal(isAdminAuthorized("finance", "PATCH", "/api/admin/plans/mei"), true);
  assert.equal(isAdminAuthorized("finance", "POST", "/api/admin/users"), false);
  assert.equal(isAdminAuthorized("owner", "DELETE", "/api/admin/customers/1"), true);
});

test("logger mascara credenciais e dados pessoais", () => {
  const masked = maskSensitive({
    email: "cliente@example.com", password: "segredo", cnpj: "12345678000199",
    nested: { authorization: "Bearer token", conta: "12345" },
  });
  assert.equal(masked.email, "[REDACTED]");
  assert.equal(masked.password, "[REDACTED]");
  assert.equal(masked.cnpj, "[REDACTED]");
  assert.equal(masked.nested.authorization, "[REDACTED]");
  assert.equal(masked.nested.conta, "[REDACTED]");
  assert.equal(maskSensitive("falha para 12345678000199"), "falha para [REDACTED_DOCUMENT]");
});

test("alerta sem webhook falha de forma segura", async () => {
  const previous = process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_WEBHOOK_URL;
  try {
    assert.deepEqual(await sendOperationalAlert("alerta_simulado", { token: "nao-vazar" }), {
      delivered: false,
      reason: "not-configured",
    });
  } finally {
    if (previous !== undefined) process.env.ALERT_WEBHOOK_URL = previous;
  }
});
