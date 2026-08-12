import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MemoryRateLimitStore,
  createRateLimitStore,
  hashRateLimitIdentity,
} from "../src/services/rateLimitService.js";

describe("armazenamento de rate limit", () => {
  test("incrementa contador e renova depois da janela", async () => {
    const store = new MemoryRateLimitStore();
    assert.equal((await store.hit("login:a", 10)).count, 1);
    assert.equal((await store.hit("login:a", 10)).count, 2);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal((await store.hit("login:a", 10)).count, 1);
  });

  test("isola contadores por chave", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit("login:a", 1000);
    await store.hit("login:a", 1000);
    assert.equal((await store.hit("login:b", 1000)).count, 1);
  });

  test("hash nao revela e-mail ou documento", () => {
    const identity = "Cliente@Email.com:12345678900";
    const hash = hashRateLimitIdentity(identity);
    assert.match(hash, /^[a-f0-9]{32}$/);
    assert.equal(hash.includes("cliente"), false);
    assert.equal(hash, hashRateLimitIdentity(identity.toLowerCase()));
  });

  test("exige Redis em producao", () => {
    assert.throws(
      () => createRateLimitStore({ nodeEnv: "production", redisUrl: "" }),
      /REDIS_URL e obrigatoria/,
    );
  });
});
