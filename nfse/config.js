export const nfseIssuer = {
  cnpj: "41952830000104",
  razaoSocial: "FACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA",
  municipio: "Caarapo",
  codigoMunicipio: "5002407",
  uf: "MS",
  telefone: "67992230801",
  email: "vilmombatista@gmail.com",
  codigoInternoContribuinte: "1480",
  serieDps: "1",
  codigoTributacaoNacional: "171901",
  descricaoTributacaoNacional: "Contabilidade, inclusive servicos tecnicos e auxiliares.",
  nbs: "113022100",
  descricaoNbs: "Servicos de contabilidade",
  opSimpNac: "3",
  regApTribSN: "1",
  regEspTrib: "0",
  localPrestacaoPadrao: "5002407",
};

export function getNfseConfig() {
  const ambiente = process.env.NFSE_AMBIENTE || process.env.NFSE_ENV || process.env.NODE_ENV || "development";

  return {
    mock: String(process.env.NFSE_MOCK || "true").toLowerCase() !== "false",
    autoEmitir: String(process.env.NFSE_AUTO_EMITIR || "false").toLowerCase() === "true",
    autoCreatePending: String(process.env.NFSE_AUTO_CREATE_PENDING || "false").toLowerCase() === "true",
    environment: ambiente,
    ambiente,
    dpsSerie: process.env.NFSE_DPS_SERIE || nfseIssuer.serieDps,
    dpsNextNumber: Number(process.env.NFSE_DPS_NEXT_NUMBER || 357),
    cnpjLookupUrl: process.env.NFSE_CNPJ_LOOKUP_URL || "",
    nacionalApiUrl: process.env.NFSE_NACIONAL_API_URL || "",
    sefinBaseUrlHomologacao:
      process.env.NFSE_SEFIN_BASE_URL_HOMOLOGACAO ||
      "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
    sefinBaseUrlProducao: process.env.NFSE_SEFIN_BASE_URL_PRODUCAO || "https://sefin.nfse.gov.br/SefinNacional",
    certPath: process.env.NFSE_CERTIFICADO_A1_PATH || process.env.NFSE_CERT_PATH || "",
    certPasswordConfigured: Boolean(process.env.NFSE_CERTIFICADO_A1_PASSWORD || process.env.NFSE_CERT_PASSWORD),
    emailFrom: process.env.NFSE_EMAIL_FROM || nfseIssuer.email,
    emailProvider: process.env.NFSE_EMAIL_PROVIDER || "",
  };
}
