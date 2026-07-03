import fs from "node:fs";
import https from "node:https";

const DEFAULT_SERPRO_TOKEN_URL = "https://autenticacao.sapi.serpro.gov.br/authenticate";

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} nao configurada.`);
  }

  return value;
}

function getBasicAuthToken(consumerKey, consumerSecret) {
  return Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
}

function getCertificateOptions() {
  const certificatePath = process.env.SERPRO_CERTIFICADO_PATH || "";
  const passphrase = process.env.SERPRO_CERTIFICADO_PASSWORD || "";

  if (!certificatePath) return {};

  if (!fs.existsSync(certificatePath)) {
    throw new Error("SERPRO_CERTIFICADO_PATH nao encontrado.");
  }

  return {
    pfx: fs.readFileSync(certificatePath),
    passphrase,
  };
}

function requestTokenWithCertificate({ tokenUrl, basicToken, body, signal }) {
  return new Promise((resolve, reject) => {
    const url = new URL(tokenUrl);
    const requestBody = Buffer.from(body);
    const request = https.request(
      {
        method: "POST",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Basic ${basicToken}`,
          "role-type": process.env.SERPRO_ROLE_TYPE || "TERCEIROS",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": requestBody.length,
        },
        ...getCertificateOptions(),
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            text: async () => Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.on("error", reject);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          const abortError = new Error("AbortError");
          abortError.name = "AbortError";
          request.destroy(abortError);
        },
        { once: true }
      );
    }

    request.write(requestBody);
    request.end();
  });
}

export async function gerarTokenSerpro() {
  const tokenUrl = process.env.SERPRO_TOKEN_URL || DEFAULT_SERPRO_TOKEN_URL;
  const consumerKey = getRequiredEnv("SERPRO_CONSUMER_KEY");
  const consumerSecret = getRequiredEnv("SERPRO_CONSUMER_SECRET");
  const basicToken = getBasicAuthToken(consumerKey, consumerSecret);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const body = "grant_type=client_credentials";
    const response = process.env.SERPRO_CERTIFICADO_PATH
      ? await requestTokenWithCertificate({ tokenUrl, basicToken, body, signal: controller.signal })
      : await fetch(tokenUrl, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Basic ${basicToken}`,
            "role-type": process.env.SERPRO_ROLE_TYPE || "TERCEIROS",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      const error = new Error("Serpro retornou uma resposta invalida ao gerar token.");
      error.status = 502;
      throw error;
    }

    if (!response.ok) {
      const error = new Error(data.error_description || data.message || data.error || "Nao foi possivel gerar token Serpro.");
      error.status = response.status;
      throw error;
    }

    return {
      access_token: data.access_token,
      jwt_token: data.jwt_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo esgotado ao gerar token Serpro.");
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
