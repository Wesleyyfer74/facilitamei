import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { carregarCertificadoA1 } from "./assinarXmlDps.js";

class SefinClientError extends Error {
  constructor(message, { code = "NFSE_SEFIN_ERROR", status = 500, responseBody = "" } = {}) {
    super(message);
    this.name = "SefinClientError";
    this.code = code;
    this.status = status;
    this.responseBody = responseBody;
  }
}

function isMockEnabled() {
  return String(process.env.NFSE_MOCK || "true").toLowerCase() !== "false";
}

function getAmbiente() {
  return String(process.env.NFSE_AMBIENTE || process.env.NFSE_ENV || "homologacao").toLowerCase();
}

function getBaseUrl() {
  const ambiente = getAmbiente();

  if (ambiente === "producao") {
    return process.env.NFSE_SEFIN_BASE_URL_PRODUCAO || "https://sefin.nfse.gov.br/SefinNacional";
  }

  return (
    process.env.NFSE_SEFIN_BASE_URL_HOMOLOGACAO ||
    process.env.NFSE_NACIONAL_API_URL ||
    "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional"
  );
}

function mockNfseXml() {
  const now = new Date().toISOString();
  const random = String(Date.now()).slice(-8);

  return `<?xml version="1.0" encoding="UTF-8"?>
<RetornoNfseMock>
  <status>emitida</status>
  <numero_nfse>${random}</numero_nfse>
  <chave_acesso>MOCK${random}${Math.floor(Math.random() * 100000)}</chave_acesso>
  <codigo_verificacao>MOCK-${random}</codigo_verificacao>
  <data_processamento>${now}</data_processamento>
</RetornoNfseMock>`;
}

function requestXml(url, xml, { pfx, passphrase } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const isHttps = target.protocol === "https:";
    const transport = isHttps ? https : http;
    const body = Buffer.from(xml, "utf8");

    const request = transport.request(
      {
        method: "POST",
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers: {
          "Content-Type": "application/xml",
          Accept: "application/xml",
          "Content-Length": body.length,
        },
        pfx,
        passphrase,
        timeout: Number(process.env.NFSE_SEFIN_TIMEOUT_MS || 30000),
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new SefinClientError(`Sefin retornou HTTP ${response.statusCode}.`, {
                code: "NFSE_SEFIN_HTTP_ERROR",
                status: response.statusCode,
                responseBody,
              }),
            );
            return;
          }

          resolve(responseBody);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new SefinClientError("Timeout ao enviar DPS para Sefin.", { code: "NFSE_SEFIN_TIMEOUT" }));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

export { SefinClientError };

export async function enviarDpsParaSefin(xmlDpsAssinado) {
  if (!xmlDpsAssinado) {
    throw new SefinClientError("XML DPS assinado e obrigatorio para envio.", {
      code: "NFSE_SIGNED_XML_MISSING",
      status: 400,
    });
  }

  const ambiente = getAmbiente();

  if (isMockEnabled()) {
    console.log("NFS-e mock ativo: envio real para Sefin ignorado.", { ambiente });
    return mockNfseXml();
  }

  if (ambiente === "producao" && process.env.NFSE_AMBIENTE !== "producao") {
    throw new SefinClientError("Envio em producao bloqueado: NFSE_AMBIENTE precisa ser exatamente producao.", {
      code: "NFSE_PRODUCTION_ENV_NOT_EXACT",
      status: 403,
    });
  }

  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const url = `${baseUrl}/nfse`;
  const certificate = await carregarCertificadoA1();

  console.log("Enviando DPS assinada para Sefin.", {
    ambiente,
    url,
    certificadoConfigurado: Boolean(certificate.pfx),
  });

  return requestXml(url, xmlDpsAssinado, certificate);
}
