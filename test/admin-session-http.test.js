import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.ADMIN_EMAIL = "admin@teste.local";
process.env.ADMIN_PASSWORD = "senha-administrativa-de-teste";
delete process.env.REDIS_URL;

const { app } = await import("../server.js");

let server;
let baseUrl;
let cookie;
let csrfToken;

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

describe("sessao administrativa por cookie", () => {
  test("login cria cookie HttpOnly e nao expoe token de sessao", async () => {
    const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    const data = await response.json();
    const setCookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal("token" in data, false);
    assert.match(data.csrfToken, /^[a-f0-9]{64}$/);
    assert.match(setCookie, /facilita_admin=[a-f0-9]{64}/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);

    cookie = setCookie.split(";")[0];
    csrfToken = data.csrfToken;
  });

  test("cookie autentica e recupera o token CSRF", async () => {
    const response = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: { Cookie: cookie } });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.admin.email, process.env.ADMIN_EMAIL);
    assert.equal(data.csrfToken, csrfToken);
  });

  test("operacao mutavel recusa ausencia de CSRF", async () => {
    const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 403);
  });

  test("logout com CSRF revoga a sessao", async () => {
    const logoutResponse = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
    });
    assert.equal(logoutResponse.status, 200);

    const meResponse = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(meResponse.status, 401);
  });
});
