export interface CacheProvider {
  incrementAndGet(key: string, ttlSeconds: number, amount?: number): Promise<number>;
  get(key: string): Promise<number>;
  set(key: string, value: number, ttlSeconds: number): Promise<void>;
  reset(key: string): Promise<void>;
}

export class MemoryCacheProvider implements CacheProvider {
  private cache: Map<string, { value: number; expiresAt: number }> = new Map();

  async incrementAndGet(key: string, ttlSeconds: number, amount: number = 1): Promise<number> {
    const now = Date.now();
    const existing = this.cache.get(key);

    if (existing && existing.expiresAt > now) {
      existing.value += amount;
      return existing.value;
    } else {
      this.cache.set(key, { value: amount, expiresAt: now + ttlSeconds * 1000 });
      return amount;
    }
  }

  async get(key: string): Promise<number> {
    const now = Date.now();
    const existing = this.cache.get(key);

    if (existing && existing.expiresAt > now) {
      return existing.value;
    }
    return 0;
  }

  async set(key: string, value: number, ttlSeconds: number): Promise<void> {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async reset(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

// Singleton instance to be used across the app. In the future, this can be swapped with RedisCacheProvider.
export const minuteCache = new MemoryCacheProvider();
