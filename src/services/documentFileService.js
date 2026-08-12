import path from "node:path";
import { fileTypeFromBuffer } from "file-type";

const binaryTypes = new Map([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);
const textExtensions = new Set(["txt", "csv", "xml"]);
const blockedExtensions = new Set(["zip", "doc", "xls", "docm", "dotm", "xlsm", "xltm", "exe", "dll", "js", "html", "svg"]);

function getExtension(fileName = "") {
  return path.extname(String(fileName)).slice(1).toLowerCase();
}

function validateTextBuffer(buffer, extension) {
  if (buffer.includes(0)) throw Object.assign(new Error("Arquivo de texto contem dados binarios."), { status: 400 });
  const text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) throw Object.assign(new Error("Arquivo de texto possui codificacao invalida."), { status: 400 });
  if (extension === "xml" && !/^\s*(?:<\?xml[\s\S]*?\?>\s*)?</.test(text)) {
    throw Object.assign(new Error("Conteudo XML invalido."), { status: 400 });
  }
  return extension === "xml" ? "application/xml" : extension === "csv" ? "text/csv" : "text/plain";
}

async function validateUploadedDocument({ buffer, originalname }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error("Arquivo vazio ou invalido."), { status: 400 });
  }
  const extension = getExtension(originalname);
  if (!extension || blockedExtensions.has(extension)) {
    throw Object.assign(new Error("Formato bloqueado por seguranca."), { status: 400 });
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (textExtensions.has(extension)) {
    if (detected) throw Object.assign(new Error("Extensao de texto nao corresponde ao conteudo real."), { status: 400 });
    return { extension, mimeType: validateTextBuffer(buffer, extension) };
  }

  const expectedMime = binaryTypes.get(extension);
  if (!expectedMime || !detected || detected.mime !== expectedMime) {
    throw Object.assign(new Error("Extensao e assinatura binaria do arquivo nao conferem."), { status: 400 });
  }
  return { extension, mimeType: expectedMime };
}

export { blockedExtensions, validateUploadedDocument };
