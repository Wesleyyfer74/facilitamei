import crypto from "node:crypto";
import { createClient } from "redis";

class MemoryRateLimitStore {
  constructor() {
    this.counters = new Map();
  }

  async connect() {}

  async disconnect() {
    this.counters.clear();
  }

  async ping() { return "PONG"; }

  async hit(key, windowMs) {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      this.counters.set(key, { count: 1, resetAt });
      return { count: 1, ttlMs: windowMs };
    }
    current.count += 1;
    return { count: current.count, ttlMs: Math.max(current.resetAt - now, 1) };
  }
}

class RedisRateLimitStore {
  constructor(url, prefix = "facilita:rate") {
    this.client = createClient({ url });
    this.prefix = prefix;
    this.client.on("error", (error) => console.error("Erro Redis rate limit:", error.message));
  }

  async connect() {
    if (!this.client.isOpen) await this.client.connect();
  }

  async disconnect() {
    if (this.client.isOpen) await this.client.quit();
  }

  async ping() { return this.client.ping(); }

  async hit(key, windowMs) {
    const redisKey = `${this.prefix}:${key}`;
    const result = await this.client.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
       local ttl = redis.call('PTTL', KEYS[1])
       return {count, ttl}`,
      { keys: [redisKey], arguments: [String(windowMs)] },
    );
    return { count: Number(result[0]), ttlMs: Math.max(Number(result[1]), 1) };
  }
}

function createRateLimitStore({ nodeEnv = process.env.NODE_ENV, redisUrl = process.env.REDIS_URL } = {}) {
  if (redisUrl) return new RedisRateLimitStore(redisUrl, process.env.REDIS_RATE_LIMIT_PREFIX || "facilita:rate");
  if (nodeEnv === "production") throw new Error("REDIS_URL e obrigatoria para rate limiting em producao.");
  return new MemoryRateLimitStore();
}

function hashRateLimitIdentity(value = "anonymous") {
  return crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex").slice(0, 32);
}

function createRateLimiter({ store, name, limit, windowMs, keyGenerator, skip }) {
  return async function rateLimitMiddleware(request, response, next) {
    try {
      if (skip?.(request)) return next();
      const rawIdentity = keyGenerator?.(request) || request.ip || request.socket?.remoteAddress || "unknown";
      const key = `${name}:${hashRateLimitIdentity(rawIdentity)}`;
      const result = await store.hit(key, windowMs);
      const remaining = Math.max(limit - result.count, 0);
      const retryAfterSeconds = Math.max(Math.ceil(result.ttlMs / 1000), 1);

      response.setHeader("RateLimit-Limit", String(limit));
      response.setHeader("RateLimit-Remaining", String(remaining));
      response.setHeader("RateLimit-Reset", String(retryAfterSeconds));

      if (result.count > limit) {
        response.setHeader("Retry-After", String(retryAfterSeconds));
        return response.status(429).json({
          error: "Muitas tentativas. Aguarde antes de tentar novamente.",
          retryAfter: retryAfterSeconds,
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  createRateLimitStore,
  createRateLimiter,
  hashRateLimitIdentity,
};
