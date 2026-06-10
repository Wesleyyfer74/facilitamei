import { nfseIssuer } from "./config.js";

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatAmount(value) {
  return Number(value || 0).toFixed(2);
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString();
}

function resolveIssuer(settings) {
  if (!settings) return nfseIssuer;

  return {
    cnpj: settings.empresa_cnpj || nfseIssuer.cnpj,
    razaoSocial: settings.empresa_nome || nfseIssuer.razaoSocial,
    municipio: settings.municipio || nfseIssuer.municipio,
    codigoMunicipio: settings.codigo_municipio || nfseIssuer.codigoMunicipio,
    uf: settings.uf || nfseIssuer.uf,
    telefone: settings.empresa_telefone || nfseIssuer.telefone,
    email: settings.empresa_email || nfseIssuer.email,
    codigoInternoContribuinte: settings.c_int_contrib || nfseIssuer.codigoInternoContribuinte,
    codigoTributacaoNacional: settings.c_trib_nac || nfseIssuer.codigoTributacaoNacional,
    descricaoTributacaoNacional: nfseIssuer.descricaoTributacaoNacional,
    nbs: settings.c_nbs || nfseIssuer.nbs,
    descricaoNbs: nfseIssuer.descricaoNbs,
    opSimpNac: settings.op_simp_nac || nfseIssuer.opSimpNac,
    regApTribSN: settings.reg_ap_trib_sn || nfseIssuer.regApTribSN,
    regEspTrib: settings.reg_esp_trib || nfseIssuer.regEspTrib,
    localPrestacaoPadrao: settings.codigo_municipio || nfseIssuer.localPrestacaoPadrao,
  };
}

export function buildMockDpsXml({ invoice, taker, plan, settings, environment = "development" }) {
  const issuer = resolveIssuer(settings);
  const description = `${nfseIssuer.descricaoNbs} - ${plan?.title || plan?.nome || invoice.plan_id}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<DPSMock versao="1.00" ambiente="${escapeXml(environment)}">
  <infDPS Id="DPS${escapeXml(issuer.cnpj)}${escapeXml(invoice.dps_serie)}${escapeXml(invoice.dps_numero)}">
    <tpAmb>${environment === "production" ? "1" : "2"}</tpAmb>
    <dhEmi>${isoDate(invoice.emitted_at || new Date())}</dhEmi>
    <serie>${escapeXml(invoice.dps_serie)}</serie>
    <nDPS>${escapeXml(invoice.dps_numero)}</nDPS>
    <prest>
      <CNPJ>${escapeXml(issuer.cnpj)}</CNPJ>
      <xNome>${escapeXml(issuer.razaoSocial)}</xNome>
      <cMun>${escapeXml(issuer.codigoMunicipio)}</cMun>
      <xMun>${escapeXml(issuer.municipio)}</xMun>
      <UF>${escapeXml(issuer.uf)}</UF>
      <fone>${escapeXml(issuer.telefone)}</fone>
      <email>${escapeXml(issuer.email)}</email>
    </prest>
    <toma>
      <CNPJ>${escapeXml(taker.cnpj)}</CNPJ>
      <xNome>${escapeXml(taker.razao_social || taker.razaoSocial)}</xNome>
      <fone>${escapeXml(taker.telefone || "")}</fone>
      <email>${escapeXml(taker.email || "")}</email>
      <ender>
        <cMun>${escapeXml(taker.codigo_municipio || taker.codigoMunicipio || "")}</cMun>
        <xMun>${escapeXml(taker.municipio || "")}</xMun>
        <UF>${escapeXml(taker.uf || "")}</UF>
      </ender>
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>${escapeXml(issuer.localPrestacaoPadrao)}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${escapeXml(issuer.codigoTributacaoNacional)}</cTribNac>
        <xTribNac>${escapeXml(issuer.descricaoTributacaoNacional)}</xTribNac>
        <cNBS>${escapeXml(issuer.nbs)}</cNBS>
        <xNBS>${escapeXml(issuer.descricaoNbs)}</xNBS>
      </cServ>
      <xDescServ>${escapeXml(description)}</xDescServ>
    </serv>
    <valores>
      <vServ>${formatAmount(invoice.valor)}</vServ>
    </valores>
    <regTrib>
      <opSimpNac>${escapeXml(issuer.opSimpNac)}</opSimpNac>
      <regApTribSN>${escapeXml(issuer.regApTribSN)}</regApTribSN>
      <regEspTrib>${escapeXml(issuer.regEspTrib)}</regEspTrib>
    </regTrib>
    <meta>
      <codigoInternoContribuinte>${escapeXml(issuer.codigoInternoContribuinte)}</codigoInternoContribuinte>
      <mock>true</mock>
    </meta>
  </infDPS>
</DPSMock>`;
}
