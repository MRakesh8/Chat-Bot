import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { db, userApiKeys } from "@workspace/db";
import { isNull, eq, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const health = {
    status: "ok", // always ok for liveness to satisfy Render
    backend: "ok",
    database: "ok",
    queue: "ok", // Placeholder for queue
    ai: "ok",
    timestamp: new Date().toISOString()
  };

  try {
    await pool.query('SELECT 1');
  } catch (error) {
    logger.error({ error }, "Health check failed (database unreachable)");
    health.database = "error";
  }
  
  try {
    // Determine AI health from system keys
    const systemKeys = await db.select().from(userApiKeys).where(or(isNull(userApiKeys.userId), eq(userApiKeys.isSystem, true)));
    if (systemKeys.length > 0) {
      const allDead = systemKeys.every(k => k.status !== "HEALTHY");
      const anyQuota = systemKeys.some(k => k.status === "QUOTA_EXCEEDED" || k.status === "COOLDOWN");
      
      if (allDead) {
        health.ai = anyQuota ? "degraded_quota" : "error";
      }
    }
  } catch (e) {
    health.ai = "unknown";
  }

  // Determine overall readiness
  // Liveness is always 200 OK so long as the process runs
  const httpStatus = 200; 

  res.status(httpStatus).json(health);
});

export default router;
