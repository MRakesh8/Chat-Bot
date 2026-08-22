/**
 * Rate Limiter Architecture & Abstraction Module
 */

export interface RateLimitOptions {
  identifier: string;
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number; // seconds
}

export interface RateLimiter {
  check(options: RateLimitOptions): Promise<RateLimitResult>;
  reset(identifier: string): Promise<void>;
}

interface MemoryEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory sliding/fixed window rate limiter implementation.
 * Prepared for pluggable RedisRateLimiter replacement.
 */
export class MemoryRateLimiter implements RateLimiter {
  private hits: Map<string, MemoryEntry> = new Map();

  async check(options: RateLimitOptions): Promise<RateLimitResult> {
    const { identifier, maxRequests, windowMs } = options;
    const now = Date.now();

    const existing = this.hits.get(identifier);

    if (!existing || now >= existing.resetTime) {
      const resetTime = now + windowMs;
      this.hits.set(identifier, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime,
      };
    }

    if (existing.count >= maxRequests) {
      const retryAfter = Math.ceil((existing.resetTime - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetTime: existing.resetTime,
        retryAfter: retryAfter > 0 ? retryAfter : 1,
      };
    }

    existing.count += 1;
    this.hits.set(identifier, existing);

    return {
      allowed: true,
      remaining: maxRequests - existing.count,
      resetTime: existing.resetTime,
    };
  }

  async reset(identifier: string): Promise<void> {
    this.hits.delete(identifier);
  }
}

// Global default rate limiter singleton
export const globalRateLimiter: RateLimiter = new MemoryRateLimiter();
