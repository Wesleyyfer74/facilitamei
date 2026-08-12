import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CLIENT_AUTH_TOKEN_TTL_MS,
  createClientAuthToken,
  hashClientAuthToken,
  normalizeClientAuthPurpose,
} from "../src/services/clientAuthTokenService.js";

describe("tokens de ativacao e recuperacao", () => {
  test("gera token aleatorio e persiste somente hash", () => {
    const first = createClientAuthToken();
    const second = createClientAuthToken();

    assert.match(first.token, /^[a-f0-9]{64}$/);
    assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(first.tokenHash, hashClientAuthToken(first.token));
    assert.notEqual(first.token, first.tokenHash);
    assert.notEqual(first.token, second.token);
  });

  test("define validade curta de 30 minutos", () => {
    const before = Date.now();
    const authToken = createClientAuthToken();
    const after = Date.now();

    assert.ok(authToken.expiresAt.getTime() >= before + CLIENT_AUTH_TOKEN_TTL_MS);
    assert.ok(authToken.expiresAt.getTime() <= after + CLIENT_AUTH_TOKEN_TTL_MS);
  });

  test("aceita somente finalidades conhecidas", () => {
    assert.equal(normalizeClientAuthPurpose("SETUP"), "setup");
    assert.equal(normalizeClientAuthPurpose("recovery"), "recovery");
    assert.equal(normalizeClientAuthPurpose("admin"), null);
  });
});
