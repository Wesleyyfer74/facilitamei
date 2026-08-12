import crypto from "node:crypto";

const sensitiveKey = /pass|password|senha|token|secret|authorization|cookie|documento|cpf|cnpj|banco|agencia|conta|email|telefone|phone|whatsapp/i;

function maskText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b\d{11}(?:\d{3})?\b/g, "[REDACTED_DOCUMENT]");
}

function maskSensitive(value, key = "") {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (value instanceof Error) return { name: value.name, message: maskText(value.message) };
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, maskSensitive(childValue, childKey)]));
  }
  if (typeof value === "string") return maskText(value);
  return value;
}

function writeLog(level, event, details = {}) {
  const record = { timestamp: new Date().toISOString(), level, event, ...maskSensitive(details) };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

function requestContextMiddleware(request, response, next) {
  const supplied = String(request.get("x-request-id") || "");
  request.requestId = /^[a-f0-9-]{16,64}$/i.test(supplied) ? supplied : crypto.randomUUID();
  response.setHeader("X-Request-Id", request.requestId);
  const startedAt = Date.now();
  const requestPath = String(request.originalUrl || request.url).split("?")[0];
  response.on("finish", () => writeLog("info", "http_request", {
    requestId: request.requestId, method: request.method, path: requestPath,
    statusCode: response.statusCode, durationMs: Date.now() - startedAt,
  }));
  next();
}

function hashIp(ip = "") { return crypto.createHash("sha256").update(String(ip)).digest("hex"); }

export { hashIp, maskSensitive, maskText, requestContextMiddleware, writeLog };
