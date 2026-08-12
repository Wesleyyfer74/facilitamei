import crypto from "node:crypto";

const PAYMENT_STATUS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashPaymentStatusToken(token = "") {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createPaymentStatusToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashPaymentStatusToken(token),
    expiresAt: new Date(Date.now() + PAYMENT_STATUS_TOKEN_TTL_MS),
  };
}

export { PAYMENT_STATUS_TOKEN_TTL_MS, createPaymentStatusToken, hashPaymentStatusToken };
