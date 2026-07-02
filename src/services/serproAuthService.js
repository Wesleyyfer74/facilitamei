const DEFAULT_SERPRO_TOKEN_URL = "https://gateway.apiserpro.serpro.gov.br/token";

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

export async function gerarTokenSerpro() {
  const tokenUrl = process.env.SERPRO_TOKEN_URL || DEFAULT_SERPRO_TOKEN_URL;
  const consumerKey = getRequiredEnv("SERPRO_CONSUMER_KEY");
  const consumerSecret = getRequiredEnv("SERPRO_CONSUMER_SECRET");
  const basicToken = getBasicAuthToken(consumerKey, consumerSecret);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${basicToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
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
