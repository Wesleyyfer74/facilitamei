import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateUploadedDocument } from "../src/services/documentFileService.js";
import { LocalPrivateDocumentStorage, documentSha256 } from "../src/services/documentStorageService.js";
import { scanDocumentBuffer } from "../src/services/antivirusService.js";

test("aceita PDF pela assinatura real e ignora MIME declarado", async () => {
  const buffer = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
  const result = await validateUploadedDocument({ buffer, originalname: "guia.pdf", mimetype: "text/plain" });
  assert.deepEqual(result, { extension: "pdf", mimeType: "application/pdf" });
});

test("bloqueia ZIP, formato ativo e extensao que nao corresponde ao conteudo", async () => {
  await assert.rejects(
    validateUploadedDocument({ buffer: Buffer.from("PK\u0003\u0004conteudo"), originalname: "arquivo.zip" }),
    /bloqueado/i,
  );
  await assert.rejects(
    validateUploadedDocument({ buffer: Buffer.from("alert(1)"), originalname: "arquivo.js" }),
    /bloqueado/i,
  );
  await assert.rejects(
    validateUploadedDocument({ buffer: Buffer.from("MZprograma"), originalname: "falso.pdf" }),
    /assinatura binaria/i,
  );
});

test("aceita texto limpo e rejeita texto com dados binarios", async () => {
  assert.equal((await validateUploadedDocument({ buffer: Buffer.from("coluna,valor\n1,2"), originalname: "dados.csv" })).mimeType, "text/csv");
  await assert.rejects(
    validateUploadedDocument({ buffer: Buffer.from([65, 0, 66]), originalname: "dados.txt" }),
    /dados binarios/i,
  );
});

test("armazenamento local privado grava, le e remove mantendo integridade", async (context) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "facilitamei-documents-"));
  context.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  const storage = new LocalPrivateDocumentStorage(rootPath);
  const buffer = Buffer.from("documento privado");
  const key = await storage.put({ buffer, extension: "txt" });
  assert.match(key, /^documents\//);
  assert.deepEqual(await storage.get(key), buffer);
  assert.equal(documentSha256(await storage.get(key)), documentSha256(buffer));
  await storage.delete(key);
  await assert.rejects(storage.get(key), /ENOENT/);
  await assert.rejects(storage.get("../segredo.txt"), /invalida/i);
});

test("antivirus pode ser opcional fora de producao e falha fechado quando obrigatorio", async () => {
  assert.deepEqual(await scanDocumentBuffer(Buffer.from("limpo"), { host: "", required: false }), {
    scanned: false,
    reason: "not-configured",
  });
  await assert.rejects(scanDocumentBuffer(Buffer.from("limpo"), { host: "", required: true }), (error) => error.status === 503);
});
