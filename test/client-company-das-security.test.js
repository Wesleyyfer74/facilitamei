import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
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

describe("autorizacao de CNPJ e DAS", () => {
  test("libera DAS somente para cliente habilitado e financeiramente ativo", () => {
    assert.equal(testSupport.hasClientDasAccess(null), false);
    assert.equal(testSupport.hasClientDasAccess({ cliente_login_ativo: 0, status: "active", has_paid_payment: 1 }), false);
    assert.equal(testSupport.hasClientDasAccess({ cliente_login_ativo: 1, status: "blocked", has_paid_payment: 1 }), false);
    assert.equal(testSupport.hasClientDasAccess({ cliente_login_ativo: 1, status: "active" }), false);
    assert.equal(testSupport.hasClientDasAccess({ cliente_login_ativo: 1, status: "active", has_paid_payment: 1 }), true);
    assert.equal(testSupport.hasClientDasAccess({ cliente_login_ativo: 1, status: "pending", has_active_subscription: 1 }), true);
  });

  test("rotas publicas de CNPJ e DAS estao descontinuadas", async () => {
    for (const pathname of ["/api/customers/cnpj", "/api/das-mei/gerar"]) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: "11222333000181", cnpjContribuinte: "11222333000181" }),
      });
      assert.equal(response.status, 410, pathname);
    }
  });

  test("rotas privadas recusam requisicao sem cookie mesmo com Bearer", async () => {
    for (const [pathname, method] of [
      ["/api/client/settings/company", "PATCH"],
      ["/api/client/das-mei/gerar", "POST"],
    ]) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: "Bearer token-antigo" },
        body: JSON.stringify({ cnpj: "11222333000181", periodoApuracao: "202608" }),
      });
      assert.equal(response.status, 401, pathname);
    }
  });

  test("diagnostico SERPRO exige chave administrativa", async () => {
    const response = await fetch(`${baseUrl}/api/serpro/token/teste`);
    assert.equal(response.status, 403);
  });
});
