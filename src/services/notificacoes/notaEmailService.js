const ISSUER_NAME = "FACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hasEmailConfig() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_PORT && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getClienteNome(cliente = {}) {
  return cliente.razao_social || cliente.cliente_razao_social || cliente.nome || cliente.cliente || "cliente";
}

function getClienteEmail(cliente = {}) {
  return cliente.email || cliente.cliente_email || "";
}

function getPublicNoteUrl(emissao = {}) {
  const baseUrl = (process.env.SITE_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "");
  if (!baseUrl || !emissao.id) return "";
  return `${baseUrl}/?nota=${encodeURIComponent(emissao.id)}`;
}

function buildEmailText({ cliente, emissao }) {
  const lines = [
    `Ola, ${getClienteNome(cliente)}.`,
    "",
    "Sua nota fiscal referente a assinatura de servicos contabeis foi emitida.",
    "",
    `Valor: ${money(emissao.valor)}`,
    `Competencia: ${emissao.competencia || "-"}`,
  ];

  if (emissao.numero_nfse) lines.push(`Numero da NFS-e: ${emissao.numero_nfse}`);
  if (emissao.chave_acesso) lines.push(`Chave de acesso: ${emissao.chave_acesso}`);

  lines.push("", "Em anexo esta o XML da nota.");

  if (emissao.pdf_url) lines.push(`PDF da nota: ${emissao.pdf_url}`);

  lines.push("", "Atenciosamente,", ISSUER_NAME);

  return lines.join("\n");
}

function buildXmlAttachment(emissao = {}) {
  const xml = emissao.xml_nfse || emissao.xml_dps;
  if (!xml) return null;

  return {
    filename: emissao.xml_nfse ? `nfse-${emissao.id || "nota"}.xml` : `dps-${emissao.id || "nota"}.xml`,
    content: xml,
    contentType: "application/xml",
  };
}

export function gerarMensagemWhatsappNota({ cliente, emissao }) {
  const noteUrl = getPublicNoteUrl(emissao) || "link da nota ainda nao disponivel";
  const numeroNfse = emissao.numero_nfse ? `\nNumero da NFS-e: ${emissao.numero_nfse}` : "";
  const chaveAcesso = emissao.chave_acesso ? `\nChave de acesso: ${emissao.chave_acesso}` : "";

  return [
    `Ola, ${getClienteNome(cliente)}.`,
    "",
    "Sua nota fiscal referente a assinatura de servicos contabeis foi emitida.",
    `Valor: ${money(emissao.valor)}`,
    `Competencia: ${emissao.competencia || "-"}`,
    `${numeroNfse}${chaveAcesso}`,
    "",
    `Acesse sua nota pelo link: ${noteUrl}`,
    "",
    ISSUER_NAME,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function enviarEmailNotaFiscal({ cliente, emissao }) {
  const to = getClienteEmail(cliente);

  if (!to) {
    console.warn("NFS-e e-mail nao enviado: cliente sem e-mail.", {
      emissaoId: emissao?.id,
      clienteId: cliente?.id || cliente?.cliente_id,
    });
    return { sent: false, reason: "cliente_sem_email" };
  }

  const attachment = buildXmlAttachment(emissao);
  if (!attachment) {
    console.warn("NFS-e e-mail nao enviado: emissao sem XML disponivel.", { emissaoId: emissao?.id });
    return { sent: false, reason: "xml_indisponivel" };
  }

  if (!hasEmailConfig()) {
    console.warn("NFS-e e-mail nao enviado: SMTP nao configurado.", { emissaoId: emissao?.id, to });
    return { sent: false, reason: "smtp_nao_configurado" };
  }

  const { default: nodemailer } = await import("nodemailer");
  const port = Number(process.env.EMAIL_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: "Sua nota fiscal foi emitida",
    text: buildEmailText({ cliente, emissao }),
    attachments: [attachment],
  });

  console.log("NFS-e e-mail enviado.", {
    emissaoId: emissao?.id,
    to,
    messageId: info.messageId,
  });

  return { sent: true, messageId: info.messageId };
}
