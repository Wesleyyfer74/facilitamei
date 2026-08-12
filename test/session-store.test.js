import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MemorySessionStore, createSessionStore } from "../src/services/sessionStore.js";

describe("armazenamento de sessoes", () => {
  test("armazena, renova e remove uma sessao em memoria", async () => {
    const store = new MemorySessionStore();
    await store.set("client", "token-a", { userId: 42, csrfToken: "csrf-a" }, 1000);

    const stored = await store.get("client", "token-a");
    assert.equal(stored.userId, 42);
    assert.equal(stored.csrfToken, "csrf-a");

    const previousExpiration = stored.expiresAt;
    const renewed = await store.touch("client", "token-a", 2000);
    assert.ok(renewed.expiresAt >= previousExpiration);

    await store.delete("client", "token-a");
    assert.equal(await store.get("client", "token-a"), null);
  });

  test("remove sessao expirada", async () => {
    const store = new MemorySessionStore();
    await store.set("admin", "token-expirado", {}, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(await store.get("admin", "token-expirado"), null);
  });

  test("revoga todas as sessoes de um cliente", async () => {
    const store = new MemorySessionStore();
    await store.set("client", "token-a", { userId: 42 }, 1000);
    await store.set("client", "token-b", { userId: 42 }, 1000);
    await store.set("client", "token-c", { userId: 99 }, 1000);

    await store.deleteByUserId("client", 42);
    assert.equal(await store.get("client", "token-a"), null);
    assert.equal(await store.get("client", "token-b"), null);
    assert.equal((await store.get("client", "token-c")).userId, 99);
  });

  test("exige Redis em producao", () => {
    assert.throws(
      () => createSessionStore({ nodeEnv: "production", redisUrl: "" }),
      /REDIS_URL e obrigatoria/,
    );
  });
});
