import { Router } from "express";
import { db } from "@workspace/db";
import { userApiKeys } from "@workspace/db";

const router = Router();

import { getDatabaseStatus } from "../../middlewares/databaseHealth";

// GET /api/system/database
router.get("/database", (req, res) => {
  res.json(getDatabaseStatus());
});

// GET /api/system/ai-status
router.get("/ai-status", async (req, res) => {
  try {
    const allKeys = await db.select().from(userApiKeys);
    
    const systemKeys = allKeys.filter(k => k.isSystem).map(k => ({
      slot: `System ${k.provider.toUpperCase()} Key ${k.id.substring(0, 4)}`,
      provider: k.provider,
      healthy: k.status === 'HEALTHY',
      status: k.status,
      remainingQuota: k.dailyLimit ? k.dailyLimit - k.dailyUsed : null,
      dailyUsed: k.dailyUsed,
      dailyLimit: k.dailyLimit,
      lastError: k.failureReason,
      lastSuccess: k.lastSuccess,
      lastFailure: k.lastFailure,
      cooldownUntil: k.cooldownUntil
    }));

    const userKeys = allKeys.filter(k => !k.isSystem).map(k => ({
      slot: `${k.name || `User ${k.provider.toUpperCase()} Key`} (${k.id.substring(0, 4)})`,
      provider: k.provider,
      userId: k.userId,
      healthy: k.status === 'HEALTHY',
      status: k.status,
      remainingQuota: k.dailyLimit ? k.dailyLimit - k.dailyUsed : null,
      dailyUsed: k.dailyUsed,
      dailyLimit: k.dailyLimit,
      lastError: k.failureReason,
      lastSuccess: k.lastSuccess,
      lastFailure: k.lastFailure,
      cooldownUntil: k.cooldownUntil
    }));

    res.json({
      success: true,
      activeProvider: "Multi-Provider",
      systemKeys,
      userKeys
    });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching ai-status");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

export default router;
