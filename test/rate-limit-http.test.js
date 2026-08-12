import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.ADMIN_EMAIL = "limite@teste.local";
process.env.ADMIN_PASSWORD = "senha-administrativa-de-teste";
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

describe("rate limit HTTP", () => {
  test("bloqueia a sexta tentativa de login administrativo", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: "senha-incorreta" }),
      });

      if (attempt <= 5) {
        assert.equal(response.status, 401, `tentativa ${attempt}`);
        assert.equal(response.headers.get("ratelimit-limit"), "5");
      } else {
        const data = await response.json();
        assert.equal(response.status, 429);
        assert.equal(response.headers.get("ratelimit-remaining"), "0");
        assert.ok(Number(response.headers.get("retry-after")) >= 1);
        assert.match(data.error, /Muitas tentativas/);
      }
    }
  });
});
