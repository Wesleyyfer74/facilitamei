const NFSE_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";

class DpsXmlError extends Error {
  constructor(message, { code = "DPS_XML_ERROR" } = {}) {
    super(message);
    this.name = "DpsXmlError";
    this.code = code;
  }
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function onlyDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function requiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new DpsXmlError(`Campo obrigatorio ausente para gerar DPS: ${fieldName}.`, {
      code: "DPS_REQUIRED_FIELD",
    });
  }
  return normalized;
}

function requiredDigits(value, fieldName, expectedLength = null) {
  const normalized = onlyDigits(value);
  if (!normalized || (expectedLength && normalized.length !== expectedLength)) {
    throw new DpsXmlError(`Campo numerico invalido para gerar DPS: ${fieldName}.`, {
      code: "DPS_INVALID_DIGITS",
    });
  }
  return normalized;
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DpsXmlError("Valor do servico invalido para gerar DPS.", {
      code: "DPS_INVALID_AMOUNT",
    });
  }
  return amount.toFixed(2);
}

function resolveEnvironment() {
  const env = String(process.env.NFSE_ENV || process.env.NODE_ENV || "development").toLowerCase();
  return env === "production" ? "1" : "2";
}

function formatCompetence(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return new Date().toISOString().slice(0, 10);
}

function resolveDescricao(configuracaoNfse, plano, emissao) {
  return (
    emissao?.descricao_servico ||
    plano?.descricao_nfse ||
    configuracaoNfse?.descricao_servico_padrao ||
    `Nota fiscal da assinatura do ${plano?.nome || "plano contratado"}.`
  );
}

function resolveNumeroDps(emissao) {
  const numero = Number(emissao?.numero_dps || emissao?.dps_numero);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new DpsXmlError("Numero DPS obrigatorio para gerar XML.", {
      code: "DPS_NUMBER_REQUIRED",
    });
  }
  return String(numero);
}

export { DpsXmlError };

export function gerarXmlDps({ configuracaoNfse, cliente, plano, pagamento, emissao }) {
  const prestador = {
    cnpj: requiredDigits(configuracaoNfse?.empresa_cnpj, "configuracaoNfse.empresa_cnpj", 14),
    telefone: onlyDigits(configuracaoNfse?.empresa_telefone),
    email: requiredString(configuracaoNfse?.empresa_email, "configuracaoNfse.empresa_email"),
    codigoMunicipio: requiredDigits(configuracaoNfse?.codigo_municipio, "configuracaoNfse.codigo_municipio"),
    serieDps: requiredString(emissao?.serie_dps || configuracaoNfse?.serie_dps, "emissao.serie_dps"),
    numeroDps: resolveNumeroDps(emissao),
    cTribNac: requiredString(configuracaoNfse?.c_trib_nac, "configuracaoNfse.c_trib_nac"),
    cNbs: requiredString(configuracaoNfse?.c_nbs, "configuracaoNfse.c_nbs"),
    cIntContrib: requiredString(configuracaoNfse?.c_int_contrib, "configuracaoNfse.c_int_contrib"),
    opSimpNac: requiredString(configuracaoNfse?.op_simp_nac, "configuracaoNfse.op_simp_nac"),
    regApTribSN: requiredString(configuracaoNfse?.reg_ap_trib_sn, "configuracaoNfse.reg_ap_trib_sn"),
    regEspTrib: requiredString(configuracaoNfse?.reg_esp_trib, "configuracaoNfse.reg_esp_trib"),
  };

  const tomador = {
    cnpj: requiredDigits(cliente?.cnpj, "cliente.cnpj", 14),
    razaoSocial: requiredString(cliente?.razao_social || cliente?.nome, "cliente.razao_social"),
    codigoMunicipio: requiredDigits(cliente?.codigo_municipio, "cliente.codigo_municipio"),
    cep: requiredDigits(cliente?.cep, "cliente.cep"),
    logradouro: requiredString(cliente?.logradouro, "cliente.logradouro"),
    numero: requiredString(cliente?.numero, "cliente.numero"),
    bairro: requiredString(cliente?.bairro, "cliente.bairro"),
    telefone: onlyDigits(cliente?.whatsapp || cliente?.telefone),
    email: String(cliente?.email || "").trim(),
  };

  const competencia = formatCompetence(emissao?.competencia || pagamento?.competencia || pagamento?.data_pagamento);
  const valor = formatAmount(emissao?.valor || pagamento?.valor || plano?.valor);
  const descricaoServico = requiredString(resolveDescricao(configuracaoNfse, plano, emissao), "descricao_servico");
  const infDpsId = `DPS${prestador.cnpj}${prestador.serieDps}${prestador.numeroDps}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="${NFSE_NAMESPACE}" versao="1.01">
  <infDPS Id="${escapeXml(infDpsId)}">
    <tpAmb>${resolveEnvironment()}</tpAmb>
    <dhEmi>${new Date().toISOString()}</dhEmi>
    <verAplic>1.0.0</verAplic>
    <serie>${escapeXml(prestador.serieDps)}</serie>
    <nDPS>${escapeXml(prestador.numeroDps)}</nDPS>
    <dCompet>${escapeXml(competencia)}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${escapeXml(prestador.codigoMunicipio)}</cLocEmi>
    <prest>
      <CNPJ>${escapeXml(prestador.cnpj)}</CNPJ>
      <fone>${escapeXml(prestador.telefone)}</fone>
      <email>${escapeXml(prestador.email)}</email>
      <regTrib>
        <opSimpNac>${escapeXml(prestador.opSimpNac)}</opSimpNac>
        <regApTribSN>${escapeXml(prestador.regApTribSN)}</regApTribSN>
        <regEspTrib>${escapeXml(prestador.regEspTrib)}</regEspTrib>
      </regTrib>
    </prest>
    <toma>
      <CNPJ>${escapeXml(tomador.cnpj)}</CNPJ>
      <xNome>${escapeXml(tomador.razaoSocial)}</xNome>
      <end>
        <endNac>
          <cMun>${escapeXml(tomador.codigoMunicipio)}</cMun>
          <CEP>${escapeXml(tomador.cep)}</CEP>
        </endNac>
        <xLgr>${escapeXml(tomador.logradouro)}</xLgr>
        <nro>${escapeXml(tomador.numero)}</nro>
        <xBairro>${escapeXml(tomador.bairro)}</xBairro>
      </end>
      <fone>${escapeXml(tomador.telefone)}</fone>
      <email>${escapeXml(tomador.email)}</email>
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>${escapeXml(prestador.codigoMunicipio)}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${escapeXml(prestador.cTribNac)}</cTribNac>
        <xDescServ>${escapeXml(descricaoServico)}</xDescServ>
        <cNBS>${escapeXml(prestador.cNbs)}</cNBS>
        <cIntContrib>${escapeXml(prestador.cIntContrib)}</cIntContrib>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${escapeXml(valor)}</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <tpRetISSQN>1</tpRetISSQN>
        </tribMun>
        <totTrib>
          <pTotTribSN>0.00</pTotTribSN>
        </totTrib>
      </trib>
    </valores>
  </infDPS>
</DPS>`;
}
