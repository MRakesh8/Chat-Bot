import { getRedisClient } from "../lib/redis";
import { logger } from "../lib/logger";

export interface CacheProvider {
  incrementAndGet(key: string, ttlSeconds: number, amount?: number): Promise<number>;
  get(key: string): Promise<number>;
  set(key: string, value: number, ttlSeconds: number): Promise<void>;
  reset(key: string): Promise<void>;
}

// L1 Bounded Local Cache
class BoundedLocalCache<T> {
  private cache: Map<string, { value: T; expiresAt: number }> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const now = Date.now();
    const existing = this.cache.get(key);
    if (existing) {
      if (existing.expiresAt > now) {
        return existing.value;
      } else {
        this.cache.delete(key);
      }
    }
    return null;
  }

  set(key: string, value: T, ttlSeconds: number): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Evict oldest (simplistic: just first item in Map iterator)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

export class DistributedNumberCacheProvider implements CacheProvider {
  private localCache = new BoundedLocalCache<number>(2000);
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private redisKey(key: string) {
    return `raghub:cache:${this.prefix}:${key}`;
  }

  async incrementAndGet(key: string, ttlSeconds: number, amount: number = 1): Promise<number> {
    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        const rKey = this.redisKey(key);
        const multi = redis.multi();
        multi.incrby(rKey, amount);
        multi.pttl(rKey);
        const results = await multi.exec();
        if (results && results[0]) {
          const total = results[0][1] as number;
          let ttl = results[1][1] as number;
          if (ttl === -1) {
            await redis.expire(rKey, ttlSeconds);
          }
          return total;
        }
      } catch (e) {
        logger.warn(e, `[CACHE] Redis incr fail for ${key}`);
      }
    }
    
    // Fallback L1
    const current = this.localCache.get(key) || 0;
    const next = current + amount;
    this.localCache.set(key, next, ttlSeconds);
    return next;
  }

  async get(key: string): Promise<number> {
    const l1 = this.localCache.get(key);
    if (l1 !== null) return l1;

    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        const val = await redis.get(this.redisKey(key));
        if (val) {
          const num = parseInt(val, 10);
          this.localCache.set(key, num, 5); // very short L1 cache for read-heavy
          return num;
        }
      } catch (e) {}
    }
    return 0;
  }

  async set(key: string, value: number, ttlSeconds: number): Promise<void> {
    this.localCache.set(key, value, ttlSeconds);
    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        await redis.setex(this.redisKey(key), ttlSeconds, value.toString());
      } catch (e) {}
    }
  }

  async reset(key: string): Promise<void> {
    this.localCache.delete(key);
    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        await redis.del(this.redisKey(key));
      } catch (e) {}
    }
  }
}

export const minuteCache = new DistributedNumberCacheProvider("minute");

export class DistributedStringCacheProvider {
  private localCache = new BoundedLocalCache<string>(500);
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private redisKey(key: string) {
    return `raghub:cache:str:${this.prefix}:${key}`;
  }

  async get(key: string): Promise<string | null> {
    const l1 = this.localCache.get(key);
    if (l1 !== null) return l1;

    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        const val = await redis.get(this.redisKey(key));
        if (val) {
          this.localCache.set(key, val, 60); // 60s L1
          return val;
        }
      } catch (e) {}
    }
    return null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.localCache.set(key, value, ttlSeconds);
    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        await redis.setex(this.redisKey(key), ttlSeconds, value);
      } catch (e) {}
    }
  }
}

export const llmResponseCache = new DistributedStringCacheProvider("llm");
