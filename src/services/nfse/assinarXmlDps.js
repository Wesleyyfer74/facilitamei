import fs from "node:fs/promises";

class AssinaturaXmlError extends Error {
  constructor(message, { code = "NFSE_XML_SIGNATURE_ERROR", status = 500 } = {}) {
    super(message);
    this.name = "AssinaturaXmlError";
    this.code = code;
    this.status = status;
  }
}

function isMockEnabled() {
  return String(process.env.NFSE_MOCK || "true").toLowerCase() !== "false";
}

function getCertificatePath() {
  return process.env.NFSE_CERTIFICADO_A1_PATH || process.env.NFSE_CERT_PATH || "";
}

function getCertificatePassword() {
  return process.env.NFSE_CERTIFICADO_A1_PASSWORD || process.env.NFSE_CERT_PASSWORD || "";
}

export { AssinaturaXmlError };

export async function carregarCertificadoA1() {
  const certificatePath = getCertificatePath();
  const passphrase = getCertificatePassword();

  if (!certificatePath) {
    throw new AssinaturaXmlError("Caminho do certificado A1 nao configurado.", {
      code: "NFSE_CERT_PATH_MISSING",
      status: 400,
    });
  }

  if (!passphrase) {
    throw new AssinaturaXmlError("Senha do certificado A1 nao configurada.", {
      code: "NFSE_CERT_PASSWORD_MISSING",
      status: 400,
    });
  }

  const pfx = await fs.readFile(certificatePath);
  return { pfx, passphrase, certificatePath };
}

export async function assinarXmlDps(xmlDps) {
  if (!xmlDps) {
    throw new AssinaturaXmlError("XML DPS e obrigatorio para assinatura.", {
      code: "NFSE_XML_DPS_MISSING",
      status: 400,
    });
  }

  if (isMockEnabled()) {
    console.log("NFS-e mock ativo: assinatura digital real ignorada.");
    return `${xmlDps}\n<!-- assinatura digital mock: NFSE_MOCK=true -->`;
  }

  await carregarCertificadoA1();

  console.log("Certificado A1 carregado. Assinatura XML real ainda aguarda plug de XMLDSig.");
  throw new AssinaturaXmlError(
    "Assinatura XML real ainda nao foi habilitada. Plugue uma biblioteca XMLDSig compativel antes de usar NFSE_MOCK=false.",
    {
      code: "NFSE_XMLDSIG_NOT_IMPLEMENTED",
      status: 501,
    },
  );
}
