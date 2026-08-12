import crypto from "node:crypto";

const roles = new Set(["owner", "finance", "support", "viewer"]);

function hashAdminPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { hash: crypto.scryptSync(String(password), salt, 64).toString("hex"), salt };
}

function verifyAdminPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const attempted = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(String(hash), "hex");
  return attempted.length === expected.length && crypto.timingSafeEqual(attempted, expected);
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of String(value || "").toUpperCase().replace(/=|\s/g, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Segredo MFA invalido.");
    bits += index.toString(2).padStart(5, "0");
  }
  return Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, "0");
}

function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  return [-30000, 0, 30000].some((offset) => crypto.timingSafeEqual(Buffer.from(totp(secret, now + offset)), Buffer.from(String(code))));
}

function isAdminAuthorized(role, method, pathname) {
  if (!roles.has(role)) return false;
  if (pathname === "/api/admin/auth/logout") return true;
  if (role === "owner") return true;
  if (pathname.startsWith("/api/admin/users")) return false;
  if (method === "GET") return true;
  if (role === "finance") return /^\/api\/admin\/(?:payments|plans|subscriptions|customers\/\d+\/(?:payments|subscriptions))/.test(pathname);
  if (role === "support") return /^\/api\/admin\/(?:customers|documents|contracts)/.test(pathname);
  return false;
}

export { hashAdminPassword, isAdminAuthorized, totp, verifyAdminPassword, verifyTotp };
