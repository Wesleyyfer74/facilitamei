import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function createStorageKey(extension) {
  const date = new Date();
  return `documents/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extension}`;
}

function assertStorageKey(key) {
  if (!/^documents\/[0-9]{4}\/[0-9]{2}\/[a-f0-9-]+\.[a-z0-9]+$/i.test(String(key))) {
    throw new Error("Chave de armazenamento invalida.");
  }
}

class LocalPrivateDocumentStorage {
  constructor(rootPath) {
    this.rootPath = path.resolve(rootPath);
    this.driver = "local";
  }

  resolve(key) {
    assertStorageKey(key);
    const target = path.resolve(this.rootPath, key);
    if (!target.startsWith(`${this.rootPath}${path.sep}`)) throw new Error("Chave fora do armazenamento privado.");
    return target;
  }

  async put({ buffer, extension }) {
    const key = createStorageKey(extension);
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { flag: "wx" });
    return key;
  }

  async get(key) {
    return fs.readFile(this.resolve(key));
  }

  async delete(key) {
    try { await fs.unlink(this.resolve(key)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

class S3PrivateDocumentStorage {
  constructor(config) {
    this.bucket = config.bucket;
    this.driver = "s3";
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.forcePathStyle),
      credentials: config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
    });
  }

  async put({ buffer, extension, mimeType }) {
    const key = createStorageKey(extension);
    const encryption = process.env.S3_DOCUMENTS_SERVER_SIDE_ENCRYPTION;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ...(encryption ? { ServerSideEncryption: encryption } : {}),
    }));
    return key;
  }

  async get(key) {
    assertStorageKey(key);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key) {
    assertStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function createDocumentStorage({ nodeEnv = process.env.NODE_ENV, rootPath } = {}) {
  const driver = process.env.DOCUMENT_STORAGE_DRIVER || (nodeEnv === "production" ? "s3" : "local");
  if (driver === "local") {
    if (nodeEnv === "production") throw new Error("Armazenamento local de documentos nao e permitido em producao.");
    return new LocalPrivateDocumentStorage(rootPath || process.env.DOCUMENT_LOCAL_STORAGE_PATH || path.resolve("data/private-documents"));
  }
  if (driver !== "s3") throw new Error("DOCUMENT_STORAGE_DRIVER invalido.");
  const config = {
    bucket: process.env.S3_DOCUMENTS_BUCKET,
    region: process.env.S3_DOCUMENTS_REGION || "us-east-1",
    endpoint: process.env.S3_DOCUMENTS_ENDPOINT || "",
    forcePathStyle: String(process.env.S3_DOCUMENTS_FORCE_PATH_STYLE || "false").toLowerCase() === "true",
    accessKeyId: process.env.S3_DOCUMENTS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_DOCUMENTS_SECRET_ACCESS_KEY || "",
  };
  if (!config.bucket) throw new Error("S3_DOCUMENTS_BUCKET e obrigatorio.");
  return new S3PrivateDocumentStorage(config);
}

function documentSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export { LocalPrivateDocumentStorage, S3PrivateDocumentStorage, createDocumentStorage, documentSha256 };
