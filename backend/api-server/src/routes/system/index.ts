import { Router } from "express";
import { db, withBypassRLS, users, userApiKeys } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";

const router = Router();

import { getDatabaseStatus } from "../../middlewares/databaseHealth";

// Valid options for user's default landing screen
const ALLOWED_DEFAULT_SCREENS = [
  "/projects",
  "/chat",
  "/services",
  "/api-center",
  "/notifications",
  "/agent-control",
  "/billing",
  "/settings",
  "/profile",
  "/admin/clarity",
];

// GET /api/system/database
router.get("/database", (req, res) => {
  res.json(getDatabaseStatus());
});

// GET /api/system/me
router.get("/me", (req, res) => {
  const dbUser = (req as any).auth?.dbUser;
  const memberships = (req as any).auth?.memberships || [];
  if (!dbUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    ...dbUser,
    defaultScreen: dbUser.defaultScreen || "/projects",
    memberships,
  });
});

// PATCH /api/system/default-screen
router.patch("/default-screen", async (req, res): Promise<any> => {
  try {
    const auth = (req as any).auth;
    const userId = auth?.userId || auth?.dbUser?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { defaultScreen } = req.body;
    if (!defaultScreen || typeof defaultScreen !== "string") {
      return res.status(400).json({ error: "defaultScreen is required and must be a string." });
    }

    const trimmedScreen = defaultScreen.trim();
    if (!ALLOWED_DEFAULT_SCREENS.includes(trimmedScreen) && !trimmedScreen.startsWith("/")) {
      return res.status(400).json({ error: "Invalid screen path." });
    }

    const [updated] = await withBypassRLS(async (tx: any) => {
      return await tx
        .update(users)
        .set({ defaultScreen: trimmedScreen })
        .where(eq(users.id, userId))
        .returning();
    });

    if (auth.dbUser) {
      auth.dbUser.defaultScreen = trimmedScreen;
    }

    return res.json({
      success: true,
      defaultScreen: updated?.defaultScreen || trimmedScreen,
      user: updated,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Error updating default screen");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/system/ai-status
router.get("/ai-status", async (req, res) => {
  try {
    const allKeys = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(userApiKeys);
    });
    
    const systemKeys = allKeys.filter((k: any) => k.isSystem).map((k: any) => ({
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

    const userKeys = allKeys.filter((k: any) => !k.isSystem).map((k: any) => ({
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
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET /api/system/admin/keys-report
// Highly restricted route for admin rakesh837m@gmail.com only
router.get("/admin/keys-report", async (req, res): Promise<any> => {
  try {
    const auth = (req as any).auth;
    const userEmail = auth?.dbUser?.email || auth?.user?.email || auth?.email;
    const role = auth?.dbUser?.role;
    const isDemoMode = process.env.LOCAL_DEMO_MODE === "true";
    
    // Allow super_admin/admin role, or local demo mode
    const isAdmin = 
      role === "super_admin" || 
      role === "admin" || 
      (isDemoMode && (!auth?.userId || userEmail === "local-demo@example.com"));
    
    if (!isAdmin) {
      req.log.warn({ userEmail, role }, "Unauthorized admin keys-report access attempt");
      return res.status(403).json({ error: "Access denied. This report is restricted to administrators." });
    }

    const allSystemKeys = await withBypassRLS(async (tx: any) => {
      return await tx
        .select()
        .from(userApiKeys)
        .where(
          or(
            isNull(userApiKeys.userId),
            eq(userApiKeys.isSystem, true)
          )
        );
    });

    const now = new Date();
    
    // Format detailed metrics for each key
    const keysReport = allSystemKeys.map((k: any) => {
      const totalRequests = k.totalRequests || 0;
      const totalFailures = k.totalFailures || 0;
      const totalSuccesses = Math.max(0, totalRequests - totalFailures);
      
      const successRate = totalRequests > 0 ? Number(((totalSuccesses / totalRequests) * 100).toFixed(2)) : 100;
      const failureRate = totalRequests > 0 ? Number(((totalFailures / totalRequests) * 100).toFixed(2)) : 0;
      
      const cooldownRemainingMinutes = k.cooldownUntil && k.cooldownUntil.getTime() > now.getTime()
        ? Math.ceil((k.cooldownUntil.getTime() - now.getTime()) / 60000)
        : 0;

      return {
        id: k.id,
        name: k.name,
        provider: k.provider,
        maskedKey: k.maskedKey,
        status: k.status,
        isEnabled: k.isEnabled,
        isPrimary: k.isPrimary,
        lastSuccess: k.lastSuccess,
        lastFailure: k.lastFailure,
        failureReason: k.failureReason,
        cooldownUntil: k.cooldownUntil,
        cooldownRemainingMinutes,
        metrics: {
          totalRequests,
          totalFailures,
          totalSuccesses,
          successRatePercent: successRate,
          failureRatePercent: failureRate,
          dailyLimit: k.dailyLimit,
          dailyUsed: k.dailyUsed,
          remainingDailyQuota: k.dailyLimit !== null && k.dailyLimit !== undefined ? Math.max(0, k.dailyLimit - k.dailyUsed) : null,
          lastResetAt: k.lastResetAt
        },
        timestamps: {
          createdAt: k.createdAt,
          updatedAt: k.updatedAt
        }
      };
    });

    // Calculate aggregate metrics across all system keys
    const totalKeys = allSystemKeys.length;
    const healthyCount = allSystemKeys.filter((k: any) => k.status === "HEALTHY").length;
    const quotaExceededCount = allSystemKeys.filter((k: any) => k.status === "QUOTA_EXCEEDED").length;
    const invalidCount = allSystemKeys.filter((k: any) => k.status === "INVALID").length;
    const unhealthyCount = allSystemKeys.filter((k: any) => k.status === "UNHEALTHY" || k.status === "COOLDOWN").length;
    
    let aggregateRequests = 0;
    let aggregateFailures = 0;
    let aggregateDailyUsed = 0;
    
    allSystemKeys.forEach((k: any) => {
      aggregateRequests += k.totalRequests || 0;
      aggregateFailures += k.totalFailures || 0;
      aggregateDailyUsed += k.dailyUsed || 0;
    });
    
    const aggregateSuccessRate = aggregateRequests > 0
      ? Number((((aggregateRequests - aggregateFailures) / aggregateRequests) * 100).toFixed(2))
      : 100;

    res.json({
      success: true,
      generatedAt: now,
      summary: {
        totalSystemKeys: totalKeys,
        healthyKeys: healthyCount,
        quotaExceededKeys: quotaExceededCount,
        invalidKeys: invalidCount,
        unhealthyKeys: unhealthyCount,
        aggregateRequests,
        aggregateFailures,
        aggregateDailyUsed,
        overallSuccessRatePercent: aggregateSuccessRate
      },
      keys: keysReport
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to generate admin keys report");
    res.status(500).json({ error: "Internal server error generating system API key report" });
  }
});

// POST /api/system/admin/reset-keys
router.post("/admin/reset-keys", async (req, res): Promise<any> => {
  try {
    const auth = (req as any).auth;
    const userEmail = auth?.dbUser?.email || auth?.user?.email || auth?.email;
    const role = auth?.dbUser?.role;
    const isDemoMode = process.env.LOCAL_DEMO_MODE === "true";
    
    const isAdmin = 
      role === "super_admin" || 
      role === "admin" || 
      (isDemoMode && (!auth?.userId || userEmail === "local-demo@example.com"));
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Reset status of all system keys
    await withBypassRLS(async (tx: any) => {
      return await tx.update(userApiKeys)
        .set({
          status: "HEALTHY",
          cooldownUntil: null,
          failureReason: null,
          dailyUsed: 0,
          healthScore: 100
        })
        .where(or(isNull(userApiKeys.userId), eq(userApiKeys.isSystem, true)));
    });

    res.json({ success: true, message: "All system keys have been reset to HEALTHY." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to reset system keys." });
  }
});

export default router;
