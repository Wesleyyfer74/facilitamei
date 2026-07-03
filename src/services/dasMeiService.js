import { gerarTokenSerpro } from "./serproAuthService.js";

const FACILITA_CNPJ = "41952830000104";
const CNPJ_LENGTH = 14;
const PERIODO_APURACAO_PATTERN = /^\d{6}$/;
const DEFAULT_SERPRO_INTEGRA_CONTADOR_URL = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Emitir";

function limparCnpj(cnpj) {
  return String(cnpj || "").replace(/\D/g, "");
}

function validarCnpj(cnpj, campo) {
  const cnpjLimpo = limparCnpj(cnpj);

  if (cnpjLimpo.length !== CNPJ_LENGTH) {
    throw new Error(`${campo} deve ter 14 digitos.`);
  }

  return cnpjLimpo;
}

function validarPeriodoApuracao(periodoApuracao) {
  const periodo = String(periodoApuracao || "").trim();

  if (!PERIODO_APURACAO_PATTERN.test(periodo)) {
    throw new Error("periodoApuracao deve estar no formato AAAAMM, exemplo: 202606.");
  }

  const mes = Number(periodo.slice(4, 6));
  if (mes < 1 || mes > 12) {
    throw new Error("periodoApuracao deve ter mes entre 01 e 12.");
  }

  return periodo;
}

export function montarPayloadGerarDasMei({ cnpjContratante = FACILITA_CNPJ, cnpjContribuinte, periodoApuracao }) {
  const contratante = validarCnpj(cnpjContratante, "cnpjContratante");
  const contribuinte = validarCnpj(cnpjContribuinte, "cnpjContribuinte");
  const periodo = validarPeriodoApuracao(periodoApuracao);

  return {
    contratante: {
      numero: contratante,
      tipo: 2,
    },
    autorPedidoDados: {
      numero: contratante,
      tipo: 2,
    },
    contribuinte: {
      numero: contribuinte,
      tipo: 2,
    },
    pedidoDados: {
      idSistema: "PGMEI",
      idServico: "GERARDASPDF21",
      dados: JSON.stringify({ periodoApuracao: periodo }),
    },
  };
}

async function parseSerproResponse(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function gerarDasMei({ cnpjContribuinte, periodoApuracao }) {
  const tokenData = await gerarTokenSerpro();
  const payload = montarPayloadGerarDasMei({ cnpjContratante: FACILITA_CNPJ, cnpjContribuinte, periodoApuracao });
  const serviceUrl = process.env.SERPRO_INTEGRA_CONTADOR_URL || DEFAULT_SERPRO_INTEGRA_CONTADOR_URL;
  const jwtToken = tokenData.jwt_token || process.env.SERPRO_JWT_TOKEN;
  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (jwtToken) {
    headers.jwt_token = jwtToken;
  }

  const response = await fetch(serviceUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await parseSerproResponse(response);

  if (!response.ok) {
    const error = new Error("Erro ao gerar DAS-MEI no Integra Contador.");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

export const DAS_MEI_FACILITA_CNPJ = FACILITA_CNPJ;
