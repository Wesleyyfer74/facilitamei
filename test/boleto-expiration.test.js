import assert from "node:assert/strict";
import test from "node:test";
import { testSupport } from "../server.js";

test("boleto aceita vencimento entre 1 e 30 dias", () => {
  const now = new Date("2026-08-18T15:00:00.000Z");
  assert.equal(testSupport.getBoletoExpirationDate("2026-08-19", now), "2026-08-19T23:59:59.000-03:00");
  assert.equal(testSupport.getBoletoExpirationDate("2026-09-17", now), "2026-09-17T23:59:59.000-03:00");
});

test("boleto recusa vencimento fora do intervalo", () => {
  const now = new Date("2026-08-18T15:00:00.000Z");
  assert.throws(() => testSupport.getBoletoExpirationDate("2026-08-18", now), /entre 1 e 30 dias/);
  assert.throws(() => testSupport.getBoletoExpirationDate("2026-09-18", now), /entre 1 e 30 dias/);
});
