import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

test("SDK Mercado Pago mantem as operacoes usadas pelo servidor", () => {
  const client = new MercadoPagoConfig({ accessToken: "TEST-token" });
  assert.equal(typeof new Payment(client).get, "function");
  assert.equal(typeof new Preference(client).create, "function");
});

test("Nodemailer envia mensagem local sem rede e bloqueia leitura de arquivo", async () => {
  const transporter = nodemailer.createTransport({
    jsonTransport: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const result = await transporter.sendMail({
    from: "teste@facilitameibr.com.br",
    to: "cliente@example.com",
    subject: "Teste",
    text: "Mensagem segura",
  });
  assert.ok(result.message);
  await assert.rejects(
    transporter.sendMail({
      from: "teste@facilitameibr.com.br",
      to: "cliente@example.com",
      subject: "Bloqueio",
      attachments: [{ path: "package.json" }],
    }),
    /File access rejected/i,
  );
});
