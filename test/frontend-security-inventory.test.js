import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("inventario de sessao do frontend", () => {
  test("proibe localStorage e Bearer e exige cookies nos dois frontends", async () => {
    const files = ["admin/admin.js", "cliente/cliente.js"];

    for (const relativePath of files) {
      const source = await fs.readFile(path.join(projectRoot, relativePath), "utf8");
      assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)/);
      assert.doesNotMatch(source, /Authorization\s*=\s*`Bearer/);
      assert.match(source, /credentials:\s*"include"/);
      assert.match(source, /X-CSRF-Token/);
    }
  });

  test("area do cliente usa somente os novos fluxos de ativacao e recuperacao", async () => {
    const script = await fs.readFile(path.join(projectRoot, "cliente/cliente.js"), "utf8");
    const html = await fs.readFile(path.join(projectRoot, "cliente/index.html"), "utf8");

    assert.doesNotMatch(script, /api\/client\/auth\/setup["`]/);
    assert.match(script, /api\/client\/auth\/setup\/request/);
    assert.match(script, /api\/client\/auth\/recovery\/request/);
    assert.match(script, /auth_token/);
    assert.doesNotMatch(html.match(/<form class="access-form" data-setup-form>[\s\S]*?<\/form>/)?.[0] || "", /documento/);
  });

  test("cadastro de CNPJ saiu do checkout e existe apenas na area autenticada", async () => {
    const publicScript = await fs.readFile(path.join(projectRoot, "app.js"), "utf8");
    const clientScript = await fs.readFile(path.join(projectRoot, "cliente/cliente.js"), "utf8");

    assert.doesNotMatch(publicScript, /\/api\/customers\/cnpj/);
    assert.match(clientScript, /\/api\/client\/settings\/company/);
  });

  test("checkout acompanha pagamento por token e nunca por ID na URL", async () => {
    const publicScript = await fs.readFile(path.join(projectRoot, "app.js"), "utf8");
    assert.match(publicScript, /data\.paymentStatusToken/);
    assert.match(publicScript, /\/api\/payments\/status/);
    assert.doesNotMatch(publicScript, /\/api\/payments\/\$\{paymentId\}\/status/);
  });
});
