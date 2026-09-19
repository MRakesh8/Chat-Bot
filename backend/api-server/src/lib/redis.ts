import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

let redisClient: Redis | null = null;

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on("error", (err) => {
      logger.error(err, "[REDIS_ERROR] Shared Redis connection error");
    });
  } catch (err) {
    logger.error(err, "[REDIS_ERROR] Failed to initialize Redis connection");
  }
}

export const getRedisClient = () => redisClient;
