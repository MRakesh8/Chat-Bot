import { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { getRedisClient } from "./redis";
import { logger } from "./logger";

export class RedisFallbackStore implements Store {
  private windowMs!: number;
  private memoryStore: Map<string, { totalHits: number; resetTime: number }> = new Map();
  prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
    // Periodic memory cleanup
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.memoryStore.entries()) {
        if (value.resetTime <= now) {
          this.memoryStore.delete(key);
        }
      }
    }, 60000).unref();
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = getRedisClient();
    const redisKey = `raghub:ratelimit:${this.prefix}:${key}`;
    const now = Date.now();
    const resetTime = new Date(now + this.windowMs);

    if (redis && redis.status === "ready") {
      try {
        const multi = redis.multi();
        multi.incr(redisKey);
        multi.pttl(redisKey);
        const results = await multi.exec();
        
        if (!results) throw new Error("Redis multi failed");
        
        const totalHits = results[0][1] as number;
        let ttl = results[1][1] as number;
        
        if (ttl === -1) {
          await redis.pexpire(redisKey, this.windowMs);
          ttl = this.windowMs;
        }
        
        return {
          totalHits,
          resetTime: new Date(now + ttl),
        };
      } catch (e) {
        logger.warn(e, `[RATE_LIMIT] Redis failure, falling back to memory for key ${key}`);
        // Fallthrough to memory store
      }
    }

    // Memory Store Fallback
    let record = this.memoryStore.get(key);
    if (!record || record.resetTime <= now) {
      record = { totalHits: 0, resetTime: now + this.windowMs };
    }
    record.totalHits++;
    this.memoryStore.set(key, record);
    
    return {
      totalHits: record.totalHits,
      resetTime: new Date(record.resetTime),
    };
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedisClient();
    const redisKey = `raghub:ratelimit:${this.prefix}:${key}`;
    if (redis && redis.status === "ready") {
      try {
        await redis.decr(redisKey);
        return;
      } catch (e) {
        // Ignore
      }
    }
    const record = this.memoryStore.get(key);
    if (record) {
      record.totalHits = Math.max(0, record.totalHits - 1);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedisClient();
    const redisKey = `raghub:ratelimit:${this.prefix}:${key}`;
    if (redis && redis.status === "ready") {
      try {
        await redis.del(redisKey);
      } catch (e) {
        // Ignore
      }
    }
    this.memoryStore.delete(key);
  }
}
