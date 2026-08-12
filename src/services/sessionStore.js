import { createClient } from "redis";

class MemorySessionStore {
  constructor() {
    this.sessions = new Map();
  }

  async connect() {}

  async disconnect() {
    this.sessions.clear();
  }

  async ping() { return "PONG"; }

  async set(namespace, token, session, ttlMs) {
    this.sessions.set(`${namespace}:${token}`, {
      ...session,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async get(namespace, token) {
    const key = `${namespace}:${token}`;
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  async touch(namespace, token, ttlMs) {
    const session = await this.get(namespace, token);
    if (!session) return null;
    session.expiresAt = Date.now() + ttlMs;
    this.sessions.set(`${namespace}:${token}`, session);
    return session;
  }

  async delete(namespace, token) {
    this.sessions.delete(`${namespace}:${token}`);
  }

  async deleteByUserId(namespace, userId) {
    for (const [key, session] of this.sessions.entries()) {
      if (key.startsWith(`${namespace}:`) && Number(session.userId) === Number(userId)) {
        this.sessions.delete(key);
      }
    }
  }
}

class RedisSessionStore {
  constructor(url, prefix = "facilita:session") {
    this.client = createClient({ url });
    this.prefix = prefix;
    this.client.on("error", (error) => console.error("Erro Redis:", error.message));
  }

  key(namespace, token) {
    return `${this.prefix}:${namespace}:${token}`;
  }

  async connect() {
    if (!this.client.isOpen) await this.client.connect();
  }

  async disconnect() {
    if (this.client.isOpen) await this.client.quit();
  }

  async ping() { return this.client.ping(); }

  async set(namespace, token, session, ttlMs) {
    const expiresAt = Date.now() + ttlMs;
    await this.client.set(this.key(namespace, token), JSON.stringify({ ...session, expiresAt }), {
      PX: ttlMs,
    });
  }

  async get(namespace, token) {
    const rawSession = await this.client.get(this.key(namespace, token));
    if (!rawSession) return null;

    try {
      return JSON.parse(rawSession);
    } catch {
      await this.delete(namespace, token);
      return null;
    }
  }

  async touch(namespace, token, ttlMs) {
    const session = await this.get(namespace, token);
    if (!session) return null;
    await this.set(namespace, token, session, ttlMs);
    return { ...session, expiresAt: Date.now() + ttlMs };
  }

  async delete(namespace, token) {
    await this.client.del(this.key(namespace, token));
  }

  async deleteByUserId(namespace, userId) {
    for await (const key of this.client.scanIterator({ MATCH: `${this.prefix}:${namespace}:*`, COUNT: 100 })) {
      const rawSession = await this.client.get(key);
      if (!rawSession) continue;
      try {
        if (Number(JSON.parse(rawSession).userId) === Number(userId)) await this.client.del(key);
      } catch {
        await this.client.del(key);
      }
    }
  }
}

function createSessionStore({ nodeEnv = process.env.NODE_ENV, redisUrl = process.env.REDIS_URL } = {}) {
  if (redisUrl) return new RedisSessionStore(redisUrl, process.env.REDIS_SESSION_PREFIX || "facilita:session");
  if (nodeEnv === "production") throw new Error("REDIS_URL e obrigatoria em producao.");
  return new MemorySessionStore();
}

export { MemorySessionStore, RedisSessionStore, createSessionStore };
