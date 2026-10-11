import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { db, userApiKeys } from "@workspace/db";
import { isNull, eq, or } from "drizzle-orm";

const router: IRouter = Router();

let lastHealthCheckTime = 0;
let cachedHealthResult: {
  database: string;
  ai: string;
} | null = null;

let lastDbErrorLogTime = 0;
const HEALTH_CACHE_TTL_MS = 10000; // 10-second cache prevents Render 5s probe connection pool exhaustion

router.get("/healthz", async (_req, res) => {
  const now = Date.now();
  let dbStatus = "ok";
  let aiStatus = "ok";

  if (cachedHealthResult && (now - lastHealthCheckTime < HEALTH_CACHE_TTL_MS)) {
    dbStatus = cachedHealthResult.database;
    aiStatus = cachedHealthResult.ai;
  } else {
    // Run database and AI dependency checks concurrently
    const [dbResult, aiResult] = await Promise.allSettled([
      pool.query('SELECT 1'),
      (async () => {
        const systemKeys = await db.select().from(userApiKeys).where(or(isNull(userApiKeys.userId), eq(userApiKeys.isSystem, true)));
        const hasEnvKey = Boolean(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

        if (systemKeys.length > 0) {
          const allDead = systemKeys.every(k => k.status !== "HEALTHY");
          const anyQuota = systemKeys.some(k => k.status === "QUOTA_EXCEEDED" || k.status === "COOLDOWN");
          if (allDead) {
            return anyQuota ? "degraded_quota" : (hasEnvKey ? "fallback_env_active" : "error");
          }
          return "ok";
        } else if (!hasEnvKey) {
          return "no_credentials_configured";
        }
        return "ok";
      })()
    ]);

    if (dbResult.status === "fulfilled") {
      dbStatus = "ok";
    } else {
      dbStatus = "error";
      if (now - lastDbErrorLogTime > 60000) {
        lastDbErrorLogTime = now;
        logger.error({ error: dbResult.reason }, "Health check failed (database unreachable)");
      }
    }

    if (aiResult.status === "fulfilled") {
      aiStatus = aiResult.value;
    } else {
      aiStatus = "unknown";
    }

    cachedHealthResult = { database: dbStatus, ai: aiStatus };
    lastHealthCheckTime = now;
  }

  const isDegraded = dbStatus === "error" || aiStatus === "error" || aiStatus === "no_credentials_configured";
  const health = {
    status: isDegraded ? "degraded" : "ok",
    backend: "ok",
    database: dbStatus,
    queue: "ok",
    ai: aiStatus,
    timestamp: new Date().toISOString()
  };

  res.status(200).json(health);
});

export default router;
