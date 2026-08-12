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

describe("contrato publico de ativacao e recuperacao", () => {
  test("rota antiga de setup esta descontinuada", async () => {
    const response = await fetch(`${baseUrl}/api/client/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "cliente@teste.local", documento: "123", password: "senha-antiga" }),
    });
    assert.equal(response.status, 410);
  });

  test("solicitacoes sem cadastro identificavel usam resposta neutra", async () => {
    for (const purpose of ["setup", "recovery"]) {
      const response = await fetch(`${baseUrl}/api/client/auth/${purpose}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.match(data.message, /Se o cadastro estiver apto/);
    }
  });

  test("confirmacao recusa token malformado sem consultar o banco", async () => {
    const response = await fetch(`${baseUrl}/api/client/auth/recovery/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalido", password: "Senha nova 123!" }),
    });
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.equal(data.error, "Link invalido ou expirado.");
  });
});
