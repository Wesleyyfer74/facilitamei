import crypto from "node:crypto";

const prefix = "enc:v1:";

function resolveKey(encodedKey = process.env.DATA_ENCRYPTION_KEY) {
  const key = Buffer.from(String(encodedKey || ""), "base64");
  if (key.length !== 32) throw Object.assign(new Error("DATA_ENCRYPTION_KEY deve conter 32 bytes em Base64."), { status: 503 });
  return key;
}

function encryptSensitive(value, encodedKey) {
  if (value === null || value === undefined || value === "") return null;
  if (String(value).startsWith(prefix)) return String(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", resolveKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

function decryptSensitive(value, encodedKey) {
  if (value === null || value === undefined || value === "") return value ?? null;
  if (!String(value).startsWith(prefix)) return String(value);
  const payload = Buffer.from(String(value).slice(prefix.length), "base64");
  if (payload.length < 29) throw new Error("Dado criptografado invalido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", resolveKey(encodedKey), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}

function decryptBankFields(record) {
  if (!record) return record;
  return {
    ...record,
    banco: decryptSensitive(record.banco),
    agencia: decryptSensitive(record.agencia),
    conta: decryptSensitive(record.conta),
    tipo_conta: decryptSensitive(record.tipo_conta),
  };
}

export { decryptBankFields, decryptSensitive, encryptSensitive };
