function normalizeDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function onlyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapLookupPayload(payload, fallback) {
  const data = onlyObject(payload);
  const address = onlyObject(data.endereco || data.address || data.estabelecimento);

  return {
    cnpj: normalizeDigits(data.cnpj || fallback.cnpj),
    razaoSocial: data.razao_social || data.razaoSocial || data.nome || fallback.razaoSocial,
    nomeFantasia: data.nome_fantasia || data.nomeFantasia || data.fantasia || null,
    email: data.email || fallback.email || null,
    telefone: normalizeDigits(data.telefone || data.phone || fallback.telefone || ""),
    municipio: data.municipio || address.cidade || address.municipio || fallback.municipio || null,
    codigoMunicipio: String(data.codigo_municipio || data.codigoMunicipio || address.codigo_municipio || fallback.codigoMunicipio || ""),
    uf: data.uf || address.uf || fallback.uf || null,
    endereco: address,
    rawPayload: data,
  };
}

export async function lookupCnpj(cnpj, { lookupUrl = "", fallback = {} } = {}) {
  const normalizedCnpj = normalizeDigits(cnpj);
  const fallbackData = {
    cnpj: normalizedCnpj,
    razaoSocial: fallback.razaoSocial || fallback.nome || "Tomador nao identificado",
    email: fallback.email || null,
    telefone: fallback.telefone || null,
    municipio: fallback.municipio || null,
    codigoMunicipio: fallback.codigoMunicipio || null,
    uf: fallback.uf || null,
  };

  if (!normalizedCnpj || normalizedCnpj.length !== 14 || !lookupUrl) {
    return {
      ...fallbackData,
      nomeFantasia: null,
      endereco: null,
      rawPayload: { source: "mock", reason: "lookup_not_configured_or_invalid_cnpj" },
    };
  }

  const url = lookupUrl.replace("{cnpj}", normalizedCnpj);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return {
      ...fallbackData,
      nomeFantasia: null,
      endereco: null,
      rawPayload: { source: "mock", reason: "lookup_failed", status: response.status },
    };
  }

  const payload = await response.json();
  return mapLookupPayload(payload, fallbackData);
}
