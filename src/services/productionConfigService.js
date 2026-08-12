function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== "production") return [];
  const required = [
    "SITE_URL", "API_PUBLIC_URL", "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "REDIS_URL",
    "MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_PUBLIC_KEY", "MERCADO_PAGO_WEBHOOK_SECRET",
    "ADMIN_API_KEY",
    "EMAIL_HOST", "EMAIL_USER", "EMAIL_PASS",
    "SERPRO_TOKEN_URL", "SERPRO_CONSUMER_KEY", "SERPRO_CONSUMER_SECRET",
    "S3_DOCUMENTS_BUCKET", "S3_DOCUMENTS_REGION", "CLAMAV_HOST", "DATA_ENCRYPTION_KEY",
  ];
  const errors = required.filter((name) => !String(env[name] || "").trim()).map((name) => `${name} ausente`);
  if (!isHttpsUrl(env.SITE_URL)) errors.push("SITE_URL deve usar HTTPS");
  for (const name of ["FRONTEND_URL", "API_PUBLIC_URL", "MERCADO_PAGO_BACK_URL"]) {
    if (env[name] && !isHttpsUrl(env[name])) errors.push(`${name} deve usar HTTPS`);
  }
  for (const origin of String(env.CORS_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)) {
    if (!isHttpsUrl(origin)) errors.push(`CORS_ORIGINS contem origem sem HTTPS: ${origin}`);
  }
  if ((env.DOCUMENT_STORAGE_DRIVER || "s3") !== "s3") errors.push("DOCUMENT_STORAGE_DRIVER deve ser s3");
  if (String(env.MERCADO_PAGO_WEBHOOK_SECRET || "").length < 16) errors.push("MERCADO_PAGO_WEBHOOK_SECRET deve ter ao menos 16 caracteres");
  if (env.DATA_ENCRYPTION_KEY && Buffer.from(env.DATA_ENCRYPTION_KEY, "base64").length !== 32) errors.push("DATA_ENCRYPTION_KEY deve conter 32 bytes em Base64");
  return [...new Set(errors)];
}

function assertProductionConfig(env = process.env) {
  const errors = validateProductionConfig(env);
  if (errors.length) throw new Error(`Configuracao de producao invalida: ${errors.join("; ")}`);
}

export { assertProductionConfig, validateProductionConfig };
