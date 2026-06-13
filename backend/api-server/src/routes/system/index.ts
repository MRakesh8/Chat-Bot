import { Router } from "express";
import { db } from "@workspace/db";
import { apiKeys } from "@workspace/db";

const router = Router();

// GET /api/system/ai-status
router.get("/ai-status", async (req, res) => {
  try {
    const allKeys = await db.select().from(apiKeys);
    
    const systemKeys = allKeys.filter(k => k.isSystem).map(k => ({
      slot: `System API ${k.id.substring(0, 4)}`,
      healthy: k.status === 'healthy',
      status: k.status,
      remainingQuota: k.dailyLimit ? k.dailyLimit - k.dailyUsed : null,
      dailyUsed: k.dailyUsed,
      dailyLimit: k.dailyLimit,
      lastError: k.lastError,
      cooldownUntil: k.cooldownUntil
    }));

    const userKeys = allKeys.filter(k => !k.isSystem).map(k => ({
      slot: `User API ${k.id.substring(0, 4)}`,
      userId: k.userId,
      healthy: k.status === 'healthy',
      status: k.status,
      remainingQuota: k.dailyLimit ? k.dailyLimit - k.dailyUsed : null,
      dailyUsed: k.dailyUsed,
      dailyLimit: k.dailyLimit,
      lastError: k.lastError,
      cooldownUntil: k.cooldownUntil
    }));

    res.json({
      success: true,
      activeProvider: "Gemini",
      systemKeys,
      userKeys
    });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching ai-status");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

export default router;
