import { Router, Request, Response } from "express";
import { db, crypto as dbCrypto } from "@workspace/db";
import { projectWidgetSettings, projectApiKeys, widgetAnalytics, widgetLeads } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router({ mergeParams: true });

function generateWidgetToken() {
  return crypto.randomBytes(32).toString("hex");
}

router.get("/settings", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const defaultSettings = {
    projectId,
    botName: "Aria AI",
    welcomeMessage: "Hello 👋",
    themeColor: "#7C3AED",
    position: "bottom-right",
    displayMode: "floating",
    allowedDomains: [],
    leadsEnabled: false,
    isEnabled: true,
    widgetToken: generateWidgetToken(),
  };

  try {
    let settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    if (!settings) {
      // Try to create default settings
      try {
        await db.insert(projectWidgetSettings).values(defaultSettings as any);
        settings = await db.query.projectWidgetSettings.findFirst({
          where: eq(projectWidgetSettings.projectId, projectId)
        });
      } catch (insertError: any) {
        // Migration might be missing or DB error
        console.error(`Failed to insert default widget settings for project ${projectId}:`, insertError.message);
        console.error(insertError.stack);
        return res.json(defaultSettings);
      }
    }

    res.json(settings || defaultSettings);
  } catch (error: any) {
    // If table doesn't exist or DB is down
    const queryError = error.message;
    const tableExists = !queryError.includes("does not exist");
    console.error({ tableExists, projectId, queryError });
    console.error(`Failed to fetch widget settings for project ${projectId}:`, error.message);
    console.error(error.stack);
    // Never return 500 for first-time projects. Use safe defaults.
    res.json(defaultSettings);
  }
});

router.put("/settings", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const updates = req.body;

  try {
    const existing = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    const safeUpdates = {
      botName: updates.botName,
      botAvatar: updates.botAvatar,
      welcomeMessage: updates.welcomeMessage,
      themeColor: updates.themeColor,
      position: updates.position,
      displayMode: updates.displayMode,
      customContainerId: updates.customContainerId,
      allowedDomains: updates.allowedDomains,
      customCss: updates.customCss,
      leadsEnabled: updates.leadsEnabled,
      humanHandoffLinks: updates.humanHandoffLinks,
      isEnabled: updates.isEnabled,
    };

    // Remove undefined values
    Object.keys(safeUpdates).forEach(key => {
      if ((safeUpdates as any)[key] === undefined) {
        delete (safeUpdates as any)[key];
      }
    });

    if (!existing) {
      const defaultSettings = {
        projectId,
        botName: safeUpdates.botName || "AI Assistant",
        welcomeMessage: safeUpdates.welcomeMessage || "Hello 👋",
        themeColor: safeUpdates.themeColor || "#8B5CF6",
        position: safeUpdates.position || "bottom-right",
        displayMode: safeUpdates.displayMode || "floating",
        allowedDomains: safeUpdates.allowedDomains || [],
        customCss: safeUpdates.customCss,
        customContainerId: safeUpdates.customContainerId,
        humanHandoffLinks: safeUpdates.humanHandoffLinks || {},
        leadsEnabled: safeUpdates.leadsEnabled || false,
        isEnabled: safeUpdates.isEnabled ?? true,
        widgetToken: generateWidgetToken(),
      };
      await db.insert(projectWidgetSettings).values(defaultSettings as any);
    } else {
      await db.update(projectWidgetSettings)
        .set({
          ...safeUpdates,
          updatedAt: new Date()
        })
        .where(eq(projectWidgetSettings.projectId, projectId));
    }

    const newSettings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });
    
    res.json(newSettings);
  } catch (error) {
    console.error("Failed to update widget settings:", error);
    res.status(500).json({ error: "Failed to update widget settings" });
  }
});

// API Keys routes for project
router.get("/api-keys", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    const keys = await db.query.projectApiKeys.findMany({
      where: eq(projectApiKeys.projectId, projectId),
    });
    
    const safeKeys = keys.map(k => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      maskedKey: k.maskedKey,
      model: k.model,
      isPrimary: k.isPrimary,
      isEnabled: k.isEnabled,
      status: k.status,
      lastSuccess: k.lastSuccess,
      lastFailure: k.lastFailure,
      failureReason: k.failureReason,
      cooldownRemaining: k.cooldownUntil && k.cooldownUntil.getTime() > Date.now() ? Math.ceil((k.cooldownUntil.getTime() - Date.now()) / 60000) : 0,
      createdAt: k.createdAt,
    }));
    
    res.json(safeKeys);
  } catch (error: any) {
    console.error({
      projectId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Failed to fetch project keys" });
  }
});

router.post("/api-keys", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { provider, apiKey, model, name } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ error: "Provider and API Key are required" });
  }

  try {
    // Basic masking (e.g., sk-12...abcd)
    const maskedKey = apiKey.substring(0, 5) + "..." + apiKey.substring(apiKey.length - 4);
    
    // In real implementation, encrypt this with KMS or env secret
    const encryptedKey = dbCrypto.encrypt(apiKey);

    const existingKeys = await db.query.projectApiKeys.findMany({
      where: eq(projectApiKeys.projectId, projectId)
    });

    await db.insert(projectApiKeys).values({
      projectId,
      name: name || `${provider.toUpperCase()} Key ${existingKeys.length + 1}`,
      provider,
      encryptedKey,
      maskedKey,
      model,
      isEnabled: true,
      isPrimary: existingKeys.length === 0,
      status: "HEALTHY",
      lastSuccess: new Date(),
    } as any);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add project API key:", error);
    res.status(500).json({ error: "Failed to add project key" });
  }
});

router.delete("/api-keys/:keyId", async (req: Request, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.delete(projectApiKeys).where(and(
      eq(projectApiKeys.id, keyId as any),
      eq(projectApiKeys.projectId, projectId)
    ));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete project key" });
  }
});

import { GoogleGenAI } from "@google/genai";

async function testGeminiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "" } });
    await client.models.generateContent({ model: "gemini-2.5-flash", contents: "test" });
    return { success: true, message: "API key verified successfully." };
  } catch (e: any) {
    if (e?.status === 429) return { success: false, message: "Quota Exceeded" };
    return { success: false, message: "Invalid API key." };
  }
}

router.post("/api-keys/:keyId/test", async (req: Request, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    const existing = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId))
    });
    if (!existing) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = dbCrypto.decrypt(existing.encryptedKey);
    const testRes = await testGeminiKey(decryptedKey || existing.encryptedKey);

    if (testRes.success) {
      await db.update(projectApiKeys).set({ status: "HEALTHY", isEnabled: true, lastSuccess: new Date(), failureReason: null }).where(eq(projectApiKeys.id, keyId as any));
      res.json({ status: "Healthy" });
    } else {
      if (testRes.message === "Quota Exceeded") {
        await db.update(projectApiKeys).set({ status: "QUOTA_EXCEEDED", failureReason: testRes.message }).where(eq(projectApiKeys.id, keyId as any));
        res.json({ status: "Quota Exceeded" });
      } else {
        await db.update(projectApiKeys).set({ status: "INVALID", isEnabled: false, failureReason: testRes.message }).where(eq(projectApiKeys.id, keyId as any));
        res.json({ status: "Invalid" });
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to test API key" });
  }
});

router.patch("/api-keys/:keyId/enable", async (req: Request, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.update(projectApiKeys).set({ isEnabled: true, status: "HEALTHY", failureReason: null }).where(and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId)));
    res.json({ success: true, message: "Key enabled." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to enable API key" });
  }
});

router.patch("/api-keys/:keyId/disable", async (req: Request, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.update(projectApiKeys).set({ isEnabled: false, status: "DISABLED" }).where(and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId)));
    res.json({ success: true, message: "Key disabled." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to disable API key" });
  }
});

router.patch("/api-keys/:keyId/primary", async (req: Request, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    // Set all others to false
    await db.update(projectApiKeys).set({ isPrimary: false }).where(and(eq(projectApiKeys.projectId, projectId), ne(projectApiKeys.id, keyId as any)));
    // Set target to true
    await db.update(projectApiKeys).set({ isPrimary: true }).where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.id, keyId as any)));
    
    res.json({ success: true, message: "Primary key updated." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update primary key" });
  }
});

// Analytics
router.get("/analytics", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    const analytics = await db.select({
      totalConversations: sql<number>`sum(${widgetAnalytics.conversations})`.mapWith(Number),
      totalMessages: sql<number>`sum(${widgetAnalytics.messages})`.mapWith(Number),
      uniqueVisitors: sql<number>`sum(${widgetAnalytics.uniqueVisitors})`.mapWith(Number),
      tokenUsage: sql<number>`sum(${widgetAnalytics.tokenUsage})`.mapWith(Number),
    })
    .from(widgetAnalytics)
    .where(eq(widgetAnalytics.projectId, projectId));

    const result = analytics[0] || { totalConversations: 0, totalMessages: 0, uniqueVisitors: 0, tokenUsage: 0 };
    res.json({
      totalConversations: result.totalConversations || 0,
      totalMessages: result.totalMessages || 0,
      uniqueVisitors: result.uniqueVisitors || 0,
      tokenUsage: result.tokenUsage || 0,
      aiCost: ((result.tokenUsage || 0) * 0.00000015).toFixed(4) // estimated cost based on Gemini Flash pricing
    });
  } catch (error) {
    console.error("Analytics fetch error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Leads
router.get("/leads", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    const leads = await db.query.widgetLeads.findMany({
      where: eq(widgetLeads.projectId, projectId),
      orderBy: (widgetLeads, { desc }) => [desc(widgetLeads.createdAt)]
    });
    res.json(leads);
  } catch (error) {
    console.error("Leads fetch error:", error);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

export default router;
