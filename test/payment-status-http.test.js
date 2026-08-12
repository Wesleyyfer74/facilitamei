import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
delete process.env.REDIS_URL;
const { app } = await import("../server.js");

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

describe("autorizacao de status de pagamento", () => {
  test("consulta antiga por ID esta descontinuada", async () => {
    const response = await fetch(`${baseUrl}/api/payments/123456/status`);
    assert.equal(response.status, 410);
  });

  test("consulta publica recusa token ausente ou malformado antes do banco", async () => {
    for (const token of ["", "token-invalido", "a".repeat(63)]) {
      const response = await fetch(`${baseUrl}/api/payments/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      assert.equal(response.status, 401);
    }
  });

  test("consulta autenticada recusa ID sem cookie", async () => {
    const response = await fetch(`${baseUrl}/api/client/payments/1/status`, {
      headers: { Authorization: "Bearer token-antigo" },
    });
    assert.equal(response.status, 401);
  });
});
