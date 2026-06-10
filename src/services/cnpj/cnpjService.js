const BRASIL_API_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1";
const DEFAULT_TIMEOUT_MS = 8000;

export class CnpjServiceError extends Error {
  constructor(message, { status = 400, code = "CNPJ_ERROR", details = null } = {}) {
    super(message);
    this.name = "CnpjServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function limparCnpj(cnpj) {
  const cleaned = String(cnpj || "").replace(/\D/g, "");

  if (cleaned.length !== 14) {
    throw new CnpjServiceError("CNPJ invalido. Informe um CNPJ com 14 digitos.", {
      status: 400,
      code: "INVALID_CNPJ",
    });
  }

  return cleaned;
}

function cleanDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function valueOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeBrasilApiPayload(payload, cnpj) {
  const codigoMunicipio = valueOrNull(payload.codigo_municipio_ibge || payload.codigo_municipio);

  if (!codigoMunicipio) {
    console.warn("BrasilAPI CNPJ sem codigo IBGE do municipio:", {
      cnpj: `${cnpj.slice(0, 8)}******`,
      municipio: payload.municipio || null,
      uf: payload.uf || null,
    });
  }

  return {
    cnpj,
    razao_social: valueOrNull(payload.razao_social),
    nome_fantasia: valueOrNull(payload.nome_fantasia),
    cep: valueOrNull(cleanDigits(payload.cep)),
    logradouro: valueOrNull(payload.logradouro),
    numero: valueOrNull(payload.numero),
    bairro: valueOrNull(payload.bairro),
    municipio: valueOrNull(payload.municipio),
    codigo_municipio: codigoMunicipio,
    uf: valueOrNull(payload.uf),
    cnae_principal_codigo: valueOrNull(payload.cnae_fiscal),
    cnae_principal_descricao: valueOrNull(payload.cnae_fiscal_descricao),
  };
}

function assertUsefulCnpjData(data) {
  if (!data.razao_social) {
    throw new CnpjServiceError("A API de CNPJ retornou dados incompletos.", {
      status: 502,
      code: "EMPTY_CNPJ_DATA",
    });
  }
}

export async function consultarCnpj(cnpj, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const cleaned = limparCnpj(cnpj);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BRASIL_API_CNPJ_URL}/${cleaned}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      throw new CnpjServiceError("CNPJ nao encontrado na BrasilAPI.", {
        status: 404,
        code: "CNPJ_NOT_FOUND",
      });
    }

    if (!response.ok) {
      throw new CnpjServiceError("BrasilAPI indisponivel ou retornou erro ao consultar CNPJ.", {
        status: 502,
        code: "CNPJ_PROVIDER_ERROR",
        details: { providerStatus: response.status },
      });
    }

    const payload = await response.json();
    const normalized = normalizeBrasilApiPayload(payload, cleaned);
    assertUsefulCnpjData(normalized);

    return normalized;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new CnpjServiceError("Tempo limite excedido ao consultar CNPJ.", {
        status: 504,
        code: "CNPJ_TIMEOUT",
      });
    }

    if (error instanceof CnpjServiceError) throw error;

    throw new CnpjServiceError("Nao foi possivel consultar o CNPJ no momento.", {
      status: 502,
      code: "CNPJ_UNAVAILABLE",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeContact({ email, whatsapp, nome }) {
  return {
    email: valueOrNull(email),
    whatsapp: valueOrNull(cleanDigits(whatsapp)),
    nome: valueOrNull(nome),
  };
}

export async function salvarOuAtualizarClientePorCnpj({ dbPool, cnpj, email, whatsapp, nome }) {
  if (!dbPool) {
    throw new CnpjServiceError("dbPool e obrigatorio para salvar cliente por CNPJ.", {
      status: 500,
      code: "DB_POOL_REQUIRED",
    });
  }

  const cleaned = limparCnpj(cnpj);
  const contact = normalizeContact({ email, whatsapp, nome });
  const cnpjData = await consultarCnpj(cleaned, {
    timeoutMs: Number(process.env.CNPJ_LOOKUP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  });

  const finalEmail = contact.email;
  if (!finalEmail) {
    throw new CnpjServiceError("E-mail e obrigatorio para salvar o cliente.", {
      status: 400,
      code: "EMAIL_REQUIRED",
    });
  }

  const finalName = contact.nome || cnpjData.razao_social;

  try {
    await dbPool.execute(
      `INSERT INTO users
        (
          nome, email, telefone, whatsapp, documento, cnpj, razao_social, nome_fantasia,
          cep, logradouro, numero, bairro, municipio, codigo_municipio, uf,
          cnae_principal_codigo, cnae_principal_descricao, status
        )
       VALUES
        (
          :nome, :email, :telefone, :whatsapp, :documento, :cnpj, :razaoSocial, :nomeFantasia,
          :cep, :logradouro, :numero, :bairro, :municipio, :codigoMunicipio, :uf,
          :cnaeCodigo, :cnaeDescricao, 'pending'
        )
       ON DUPLICATE KEY UPDATE
          nome = COALESCE(VALUES(nome), nome),
          email = VALUES(email),
          telefone = COALESCE(VALUES(telefone), telefone),
          whatsapp = COALESCE(VALUES(whatsapp), whatsapp),
          documento = VALUES(documento),
          razao_social = VALUES(razao_social),
          nome_fantasia = VALUES(nome_fantasia),
          cep = VALUES(cep),
          logradouro = VALUES(logradouro),
          numero = VALUES(numero),
          bairro = VALUES(bairro),
          municipio = VALUES(municipio),
          codigo_municipio = VALUES(codigo_municipio),
          uf = VALUES(uf),
          cnae_principal_codigo = VALUES(cnae_principal_codigo),
          cnae_principal_descricao = VALUES(cnae_principal_descricao),
          updated_at = CURRENT_TIMESTAMP`,
      {
        nome: finalName,
        email: finalEmail,
        telefone: contact.whatsapp,
        whatsapp: contact.whatsapp,
        documento: cleaned,
        cnpj: cleaned,
        razaoSocial: cnpjData.razao_social,
        nomeFantasia: cnpjData.nome_fantasia,
        cep: cnpjData.cep,
        logradouro: cnpjData.logradouro,
        numero: cnpjData.numero,
        bairro: cnpjData.bairro,
        municipio: cnpjData.municipio,
        codigoMunicipio: cnpjData.codigo_municipio,
        uf: cnpjData.uf,
        cnaeCodigo: cnpjData.cnae_principal_codigo,
        cnaeDescricao: cnpjData.cnae_principal_descricao,
      },
    );
  } catch (error) {
    if (error?.code === "ER_BAD_FIELD_ERROR") {
      throw new CnpjServiceError("Campos de cliente para NFS-e ainda nao existem. Rode database/nfse-schema.sql.", {
        status: 500,
        code: "CNPJ_SCHEMA_MISSING",
      });
    }

    throw error;
  }

  const [rows] = await dbPool.execute(
    `SELECT
      id, nome, email, COALESCE(whatsapp, telefone) AS whatsapp, cnpj, razao_social, nome_fantasia,
      cep, logradouro, numero, bairro, municipio, codigo_municipio, uf,
      cnae_principal_codigo, cnae_principal_descricao, created_at, updated_at
     FROM users
     WHERE cnpj = :cnpj
     LIMIT 1`,
    { cnpj: cleaned },
  );

  console.info("CNPJ consultado e cliente salvo/atualizado:", {
    clienteId: rows[0]?.id,
    cnpj: `${cleaned.slice(0, 8)}******`,
    municipio: cnpjData.municipio,
    uf: cnpjData.uf,
  });

  return rows[0];
}

export function createCnpjService({ dbPool }) {
  async function salvarClientePorCnpj(payload) {
    return salvarOuAtualizarClientePorCnpj({ dbPool, ...payload });
  }

  return {
    salvarOuAtualizarClientePorCnpj: salvarClientePorCnpj,
  };
}
