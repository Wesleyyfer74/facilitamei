import crypto from "node:crypto";

const CLIENT_AUTH_TOKEN_BYTES = 32;
const CLIENT_AUTH_TOKEN_TTL_MS = 30 * 60 * 1000;
const CLIENT_AUTH_PURPOSES = new Set(["setup", "recovery"]);

function hashClientAuthToken(token = "") {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createClientAuthToken() {
  const token = crypto.randomBytes(CLIENT_AUTH_TOKEN_BYTES).toString("hex");
  return {
    token,
    tokenHash: hashClientAuthToken(token),
    expiresAt: new Date(Date.now() + CLIENT_AUTH_TOKEN_TTL_MS),
  };
}

function normalizeClientAuthPurpose(purpose = "") {
  const normalized = String(purpose).trim().toLowerCase();
  return CLIENT_AUTH_PURPOSES.has(normalized) ? normalized : null;
}

export {
  CLIENT_AUTH_TOKEN_TTL_MS,
  createClientAuthToken,
  hashClientAuthToken,
  normalizeClientAuthPurpose,
};
