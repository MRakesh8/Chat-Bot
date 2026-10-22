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
    // Check database and AI dependencies in a single lightweight query with bounded 2s timeout
    const DB_CHECK_TIMEOUT_MS = 2000;
    let timeoutHandle: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("Health check database query timed out")), DB_CHECK_TIMEOUT_MS);
    });

    try {
      const systemKeysPromise = db
        .select({
          id: userApiKeys.id,
          status: userApiKeys.status,
        })
        .from(userApiKeys)
        .where(or(isNull(userApiKeys.userId), eq(userApiKeys.isSystem, true)));

      const systemKeys = await Promise.race([systemKeysPromise, timeoutPromise]);
      dbStatus = "ok";

      const hasEnvKey = Boolean(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
      if (systemKeys.length > 0) {
        const allDead = systemKeys.every(k => k.status !== "HEALTHY");
        const anyQuota = systemKeys.some(k => k.status === "QUOTA_EXCEEDED" || k.status === "COOLDOWN");
        if (allDead) {
          aiStatus = anyQuota ? "degraded_quota" : (hasEnvKey ? "fallback_env_active" : "error");
        } else {
          aiStatus = "ok";
        }
      } else if (!hasEnvKey) {
        aiStatus = "no_credentials_configured";
      } else {
        aiStatus = "ok";
      }
    } catch (err: any) {
      dbStatus = "error";
      aiStatus = "unknown";
      if (now - lastDbErrorLogTime > 60000) {
        lastDbErrorLogTime = now;
        logger.error({ error: err?.message || err }, "Health check failed (database unreachable or timed out)");
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
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
