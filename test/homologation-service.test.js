import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { validateHomologationConfig, validateHomologationFiles } from "../src/services/homologationService.js";

test("preflight encontra todos os arquivos obrigatorios", async () => {
  assert.deepEqual(await validateHomologationFiles(path.resolve(import.meta.dirname, "..")), []);
});

test("homologacao recusa dominio e credencial de producao", () => {
  const errors = validateHomologationConfig({
    NODE_ENV: "production",
    SITE_URL: "https://facilitameibr.com.br",
    MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-producao",
  });
  assert.ok(errors.includes("SITE_URL de homologacao nao deve ser o dominio de producao"));
  assert.ok(errors.includes("MERCADO_PAGO_ACCESS_TOKEN deve ser uma credencial de sandbox/teste"));
});
