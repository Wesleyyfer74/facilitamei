import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsappRecipient, sendBoletoWhatsappTemplate } from "../src/services/whatsappCloudService.js";

test("normaliza telefone brasileiro para WhatsApp Cloud", () => {
  assert.equal(normalizeWhatsappRecipient("(67) 99999-0000"), "5567999990000");
  assert.equal(normalizeWhatsappRecipient("55 67 99999-0000"), "5567999990000");
});

test("envia template de boleto com as quatro variaveis na ordem correta", async () => {
  let request;
  const result = await sendBoletoWhatsappTemplate({
    recipient: "67999990000",
    customerName: "Cliente Teste",
    amount: "R$ 99,90",
    dueDate: "21/08/2026",
    paymentLink: "https://example.com/boleto",
  }, {
    config: {
      accessToken: "token-seguro",
      phoneNumberId: "123456",
      templateName: "facilita_mei_boleto",
      languageCode: "pt_BR",
      apiVersion: "v23.0",
    },
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ messages: [{ id: "wamid.123" }] }) };
    },
    signal: {},
  });
  assert.equal(request.url, "https://graph.facebook.com/v23.0/123456/messages");
  assert.equal(request.body.to, "5567999990000");
  assert.deepEqual(request.body.template.components[0].parameters.map((item) => item.text), [
    "Cliente Teste", "R$ 99,90", "21/08/2026", "https://example.com/boleto",
  ]);
  assert.equal(result.messageId, "wamid.123");
});
