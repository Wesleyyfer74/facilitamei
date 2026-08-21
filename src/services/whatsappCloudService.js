function normalizeWhatsappRecipient(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function getWhatsappCloudConfig(env = process.env) {
  return {
    accessToken: String(env.WHATSAPP_CLOUD_ACCESS_TOKEN || "").trim(),
    phoneNumberId: String(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim(),
    templateName: String(env.WHATSAPP_CLOUD_BOLETO_TEMPLATE || "facilita_mei_boleto").trim(),
    pendingTemplateName: String(env.WHATSAPP_CLOUD_PENDING_TEMPLATE || "facilita_mei_pagamento_pendente").trim(),
    languageCode: String(env.WHATSAPP_CLOUD_TEMPLATE_LANGUAGE || "pt_BR").trim(),
    apiVersion: String(env.WHATSAPP_CLOUD_API_VERSION || "v23.0").trim(),
  };
}

function isWhatsappPendingTemplateConfigured(env = process.env) {
  const config = getWhatsappCloudConfig(env);
  return Boolean(config.accessToken && config.phoneNumberId && config.pendingTemplateName && config.languageCode);
}

async function sendWhatsappTemplate({ recipient, templateName, parameters = [] }, options = {}) {
  const config = options.config || getWhatsappCloudConfig(options.env);
  const to = normalizeWhatsappRecipient(recipient);
  if (!config.accessToken || !config.phoneNumberId) throw new Error("WhatsApp Cloud API nao configurada.");
  if (!to) throw new Error("Cliente sem numero de WhatsApp valido.");
  if (!templateName) throw new Error("Modelo de WhatsApp nao configurado.");

  const components = parameters.length
    ? [{ type: "body", parameters: parameters.map((value) => ({ type: "text", text: String(value || "-") })) }]
    : undefined;
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: { name: templateName, language: { code: config.languageCode }, ...(components ? { components } : {}) },
      }),
      signal: options.signal || AbortSignal.timeout(15000),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "Falha ao enviar mensagem pelo WhatsApp.");
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return { messageId: data.messages?.[0]?.id || null, recipient: to };
}

function isWhatsappCloudConfigured(env = process.env) {
  const config = getWhatsappCloudConfig(env);
  return Boolean(config.accessToken && config.phoneNumberId && config.templateName && config.languageCode);
}

async function sendBoletoWhatsappTemplate({ recipient, customerName, amount, dueDate, paymentLink }, options = {}) {
  const config = options.config || getWhatsappCloudConfig(options.env);
  if (!paymentLink) throw new Error("Boleto sem link de pagamento.");
  return sendWhatsappTemplate({
    recipient,
    templateName: config.templateName,
    parameters: [customerName, amount, dueDate, paymentLink],
  }, { ...options, config });
}

async function sendPendingPaymentWhatsappTemplate({ recipient }, options = {}) {
  const config = options.config || getWhatsappCloudConfig(options.env);
  return sendWhatsappTemplate({ recipient, templateName: config.pendingTemplateName }, { ...options, config });
}

export {
  getWhatsappCloudConfig,
  isWhatsappCloudConfigured,
  isWhatsappPendingTemplateConfigured,
  normalizeWhatsappRecipient,
  sendBoletoWhatsappTemplate,
  sendPendingPaymentWhatsappTemplate,
};
