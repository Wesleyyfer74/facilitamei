import fs from "node:fs/promises";
import path from "node:path";
import { validateProductionConfig } from "./productionConfigService.js";

async function validateHomologationFiles(projectRoot) {
  const required = [
    "railway.json", ".github/workflows/ci.yml", "database/railway-schema.sql",
    "database/migrations/002-encrypt-sensitive-data.sql",
    "database/migrations/003-query-indexes.sql",
    "database/migrations/004-admin-users-audit.sql",
    "docs/deploy-rollback.md",
  ];
  const missing = [];
  for (const relativePath of required) {
    try { await fs.access(path.join(projectRoot, relativePath)); } catch { missing.push(relativePath); }
  }
  return missing;
}

function validateHomologationConfig(env) {
  const normalized = { ...env, NODE_ENV: "production" };
  const errors = validateProductionConfig(normalized);
  if (normalized.SITE_URL === "https://facilitameibr.com.br") {
    errors.push("SITE_URL de homologacao nao deve ser o dominio de producao");
  }
  if (!/sandbox|test/i.test(String(normalized.MERCADO_PAGO_ACCESS_TOKEN || ""))) {
    errors.push("MERCADO_PAGO_ACCESS_TOKEN deve ser uma credencial de sandbox/teste");
  }
  return [...new Set(errors)];
}

export { validateHomologationConfig, validateHomologationFiles };
