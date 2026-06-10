function pickTag(xml, tagNames = []) {
  for (const tagName of tagNames) {
    const pattern = new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, "i");
    const match = String(xml || "").match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function cleanValue(value) {
  if (!value) return null;
  return String(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

export function extrairRetornoNfse(xml) {
  const numeroNfse = cleanValue(
    pickTag(xml, ["numero_nfse", "nNFSe", "nNFS-e", "numeroNfse", "NumeroNfse", "Numero"]),
  );
  const chaveAcesso = cleanValue(
    pickTag(xml, ["chave_acesso", "chAcesso", "chaveAcesso", "ChaveAcesso", "chNFSe", "Chave"]),
  );
  const codigoVerificacao = cleanValue(
    pickTag(xml, ["codigo_verificacao", "cVerif", "codigoVerificacao", "CodigoVerificacao", "CodVerificacao"]),
  );
  const status = cleanValue(pickTag(xml, ["status", "Status", "cStat", "situacao", "Situacao"])) || "emitida";

  return {
    numero_nfse: numeroNfse,
    chave_acesso: chaveAcesso,
    codigo_verificacao: codigoVerificacao,
    status,
  };
}
