import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://127.0.0.1";
process.env.API_PUBLIC_URL = "http://127.0.0.1";

const { app } = await import("../server.js");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("baseline HTTP", () => {
  test("serve a pagina publica com cabecalhos de seguranca", async () => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("x-request-id") || "", /^[a-f0-9-]{16,64}$/i);
    assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.match(html, /<title>Facilita MEI<\/title>/);
  });

  test("serve paineis, configuracao da API publica e health check", async () => {
    const [adminResponse, clientResponse, configResponse, liveResponse] = await Promise.all([
      fetch(`${baseUrl}/admin/`),
      fetch(`${baseUrl}/cliente/`),
      fetch(`${baseUrl}/config.js`),
      fetch(`${baseUrl}/health/live`),
    ]);
    assert.equal(adminResponse.status, 200);
    assert.match(await adminResponse.text(), /Facilita MEI/i);
    assert.equal(clientResponse.status, 200);
    assert.match(await clientResponse.text(), /Facilita MEI/i);
    assert.equal(configResponse.status, 200);
    assert.match(await configResponse.text(), /https:\/\/facilitamei-production\.up\.railway\.app/);
    assert.deepEqual(await liveResponse.json(), { status: "ok" });
  });

  test("bloqueia arquivos internos", async () => {
    for (const pathname of ["/.env", "/server.js", "/database/schema.sql", "/docs/status-tecnico.md"]) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 404, pathname);
    }
  });

  test("retorna JSON para rota de API inexistente", async () => {
    const response = await fetch(`${baseUrl}/api/nao-existe`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, { error: "Rota nao encontrada." });
  });

  test("recusa origem CORS desconhecida", async () => {
    const response = await fetch(`${baseUrl}/api/config`, {
      headers: { Origin: "https://origem-maliciosa.example" },
    });

    assert.equal(response.status, 403);
  });
});
