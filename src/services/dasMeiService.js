const FACILITA_CNPJ = "41952830000104";
const CNPJ_LENGTH = 14;
const PERIODO_APURACAO_PATTERN = /^\d{6}$/;

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

export const DAS_MEI_FACILITA_CNPJ = FACILITA_CNPJ;
