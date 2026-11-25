import { Router, Request, Response } from "express";
import { db, crypto as dbCrypto } from "@workspace/db";
import { projectWidgetSettings, projectApiKeys, widgetAnalytics, widgetLeads, projectContextSettings, chatSessions, messages, frequentQuestions, knowledgeGaps, enterpriseAuditLogs, messageFeedback, projectFeedback } from "@workspace/db/schema";
import { eq, and, sql, ne, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";
import { ai } from "@workspace/integrations-gemini-ai";
import { authorizeMembership } from "../../middlewares/authorizeMembership";
import { entitlementGuard } from "../../security";
import { isDemoProjectId, getDemoWidgetSettings } from "../../services/demo-project";
import { activityBus, emitActivityEvent, ActivityItem } from "../../services/activity";

const router = Router({ mergeParams: true });

// Enforce project ownership/membership for all widget admin routes
router.use(authorizeMembership("viewer"));

function generateWidgetToken() {
  return crypto.randomBytes(32).toString("hex");
}

router.get("/settings", async (req: any, res: Response) => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    return res.json(getDemoWidgetSettings());
  }
  const defaultSettings = {
    projectId,
    botName: "AI Assistant",
    welcomeMessage: "Hello 👋",
    themeColor: "#8B5CF6",
    position: "bottom-right",
    displayMode: "floating",
    inputPlaceholder: "Ask a question...",
    onlineStatus: "Online",
    appearance: {
      themeMode: "all",
      themeColor: "#8B5CF6"
    },
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
        req.log.error(insertError, `Failed to insert default widget settings for project ${projectId}`);
        return res.json(defaultSettings);
      }
    }

    return res.json(settings || defaultSettings);
  } catch (error: any) {
    // If table doesn't exist or DB is down
    const queryError = error.message;
    const tableExists = !queryError.includes("does not exist");
    req.log.error({ tableExists, projectId, err: error }, `Failed to fetch widget settings for project ${projectId}`);
    // Never return 500 for first-time projects. Use safe defaults.
    return res.json(defaultSettings);
  }
});

router.put("/settings", async (req: any, res: Response) => {
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
      inputPlaceholder: updates.inputPlaceholder,
      onlineStatus: updates.onlineStatus,
      appearance: updates.appearance,
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

    // Server-side guard: reject non-CSS content from being saved to customCss
    if (typeof safeUpdates.customCss === "string" && safeUpdates.customCss.trim() && looksLikeNonCSS(safeUpdates.customCss)) {
      req.log.warn(`Blocked non-CSS content from being saved to customCss for project ${projectId}`);
      safeUpdates.customCss = "";
    }

    if (!existing) {
      const defaultSettings = {
        projectId,
        botName: safeUpdates.botName || "AI Assistant",
        welcomeMessage: safeUpdates.welcomeMessage || "Hello ðŸ‘‹",
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
    req.log.error(error, "Failed to update widget settings");
    res.status(500).json({ error: "Failed to update widget settings" });
  }
});

// API Keys routes for project
router.get("/api-keys", async (req: any, res: Response): Promise<void> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    res.json([]);
    return;
  }
  try {
    const keys = await db
      .select({
        id: projectApiKeys.id,
        name: projectApiKeys.name,
        provider: projectApiKeys.provider,
        maskedKey: projectApiKeys.maskedKey,
        model: projectApiKeys.model,
        isPrimary: projectApiKeys.isPrimary,
        isEnabled: projectApiKeys.isEnabled,
        status: projectApiKeys.status,
        lastSuccess: projectApiKeys.lastSuccess,
        lastFailure: projectApiKeys.lastFailure,
        failureReason: projectApiKeys.failureReason,
        cooldownUntil: projectApiKeys.cooldownUntil,
        createdAt: projectApiKeys.createdAt,
      })
      .from(projectApiKeys)
      .where(eq(projectApiKeys.projectId, projectId));
    
    const now = Date.now();
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
      cooldownRemaining: k.cooldownUntil && k.cooldownUntil.getTime() > now ? Math.ceil((k.cooldownUntil.getTime() - now) / 60000) : 0,
      createdAt: k.createdAt,
    }));
    
    res.json(safeKeys);
  } catch (error: any) {
    req.log.error({ projectId, err: error }, "Failed to fetch project keys");
    res.status(500).json({ error: "Failed to fetch project keys" });
  }
});

import { ProviderVerifier } from "../../services/provider-verifier";
import { updateKeyStats } from "../../services/api-health";

router.post("/api-keys", async (req: any, res: Response) => {
  const { projectId } = req.params;
  const { apiKey, name } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "API Key is required" });
  }

  try {
    // Detect provider and fetch models automatically
    const verified = await ProviderVerifier.verifyAndFetchModels(apiKey);
    
    // Basic masking (e.g., sk-12...abcd)
    let maskedKey = apiKey.substring(0, 5) + "..." + apiKey.substring(apiKey.length - 4);
    if (verified.provider === "gemini") {
      maskedKey = `AIza****${apiKey.slice(-4)}`;
    }

    // In real implementation, encrypt this with KMS or env secret
    const encryptedKey = dbCrypto.encrypt(apiKey);

    const existingKeys = await db.query.projectApiKeys.findMany({
      where: eq(projectApiKeys.projectId, projectId)
    });

    // Duplicate detection
    const isDuplicate = existingKeys.some(k => {
      try {
        return dbCrypto.decrypt(k.encryptedKey) === apiKey;
      } catch { return false; }
    });
    if (isDuplicate) return res.status(409).json({ error: "This API key already exists for this project." });

    await db.insert(projectApiKeys).values({
      projectId,
      name: name || `${verified.provider.toUpperCase()} Key ${existingKeys.length + 1}`,
      provider: verified.provider,
      encryptedKey,
      maskedKey,
      model: verified.defaultModel,
      availableModels: verified.models,
      isEnabled: true,
      isPrimary: existingKeys.length === 0,
      status: "HEALTHY",
      lastSuccess: new Date(),
    } as any);

    return res.json({ success: true, provider: verified.provider, model: verified.defaultModel });
  } catch (error: any) {
    req.log.error(error, "Failed to add project API key");
    return res.status(400).json({ error: error.message || "Failed to verify or add project key" });
  }
});

router.put("/api-keys/:keyId", async (req: any, res: Response): Promise<any> => {
  const { projectId, keyId } = req.params;
  const { model, name, apiKey } = req.body;
  try {
    const existing = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId))
    });
    if (!existing) {
      return res.status(404).json({ error: "Key not found" });
    }

    let updateData: any = {};
    if (name) updateData.name = name;

    // Validate if the model is in availableModels
    if (model) {
      if (existing.availableModels && Array.isArray(existing.availableModels)) {
        if (!existing.availableModels.includes(model)) {
          res.status(400).json({ error: `Model ${model} is not supported by this API key.` });
          return;
        }
      }
      updateData.model = model;
    }

    if (apiKey) {
      try {
        const verified = await ProviderVerifier.verifyAndFetchModels(apiKey, existing.provider);
        updateData.encryptedKey = dbCrypto.encrypt(apiKey);
        let maskedKey = apiKey.substring(0, 5) + "..." + apiKey.substring(apiKey.length - 4);
        if (verified.provider === "gemini") {
          maskedKey = `AIza****${apiKey.slice(-4)}`;
        }
        updateData.maskedKey = maskedKey;
        updateData.status = "HEALTHY";
        updateData.lastSuccess = new Date();
        updateData.isEnabled = true;
        updateData.failureReason = null;
        updateData.cooldownUntil = null;
        updateData.provider = verified.provider;
        updateData.model = verified.defaultModel;
        updateData.availableModels = verified.models;
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Failed to verify replacement API key" });
      }
    }

    await db.update(projectApiKeys).set(updateData).where(and(
      eq(projectApiKeys.id, keyId as any),
      eq(projectApiKeys.projectId, projectId)
    ));
    res.json({ success: true, message: "Project API key updated successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to update project key" });
  }
});

router.delete("/api-keys/:keyId", async (req: any, res: Response) => {
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

// The provider verifier is imported at the top of the file

router.post("/api-keys/:keyId/verify", async (req: any, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    const key = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId))
    });
    if (!key) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = dbCrypto.decrypt(key.encryptedKey);
    const startTime = Date.now();

    const keyObj = {
      id: key.id,
      type: 'project' as const,
      provider: key.provider,
      rawDbKey: key
    };

    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey, key.provider);
      const latencyMs = Date.now() - startTime;

      await updateKeyStats({
        key: keyObj,
        success: true,
        latencyMs,
        status: "HEALTHY",
        model: verified.defaultModel || "unknown"
      });
      
      if (verified.models && verified.models.length > 0) {
        await db.update(projectApiKeys).set({ availableModels: verified.models }).where(eq(projectApiKeys.id, key.id as any));
      }

      return res.json({ success: true, models: verified.models, defaultModel: verified.defaultModel });
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await updateKeyStats({
        key: keyObj,
        success: false,
        latencyMs,
        status: "INVALID_API_KEY",
        error: e,
        model: "unknown"
      });
      return res.status(400).json({ error: e.message || "Failed to verify API key" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to verify API key" });
  }
});

router.post("/api-keys/:keyId/test", async (req: any, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    const existing = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId))
    });
    if (!existing) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = dbCrypto.decrypt(existing.encryptedKey);
    if (!decryptedKey) {
      return res.status(422).json({
        error: "Unable to decrypt stored API key. Please verify that the correct ENCRYPTION_KEY is configured on the server.",
        code: "DECRYPTION_FAILED"
      });
    }
    
    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey, existing.provider);
      await db.update(projectApiKeys).set({ 
        status: "HEALTHY", 
        isEnabled: true, 
        lastSuccess: new Date(), 
        failureReason: null,
        availableModels: verified.models // auto update models on test
      }).where(eq(projectApiKeys.id, keyId as any));
      return res.json({ status: "Healthy", models: verified.models });
    } catch (e: any) {
      const msg = e.message || "Invalid API key";
      if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("429")) {
        await db.update(projectApiKeys).set({ status: "QUOTA_EXCEEDED", failureReason: msg }).where(eq(projectApiKeys.id, keyId as any));
        return res.json({ status: "Quota Exceeded" });
      } else {
        await db.update(projectApiKeys).set({ status: "INVALID", isEnabled: false, failureReason: msg }).where(eq(projectApiKeys.id, keyId as any));
        return res.json({ status: "Invalid" });
      }
    }
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to test API key" });
  }
});

router.patch("/api-keys/:keyId/enable", async (req: any, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.update(projectApiKeys).set({ isEnabled: true, status: "HEALTHY", failureReason: null }).where(and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId)));
    res.json({ success: true, message: "Key enabled." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to enable API key" });
  }
});

router.patch("/api-keys/:keyId/disable", async (req: any, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.update(projectApiKeys).set({ isEnabled: false, status: "DISABLED" }).where(and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId)));
    res.json({ success: true, message: "Key disabled." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to disable API key" });
  }
});

router.post("/api-keys/:keyId/reset-cooldown", async (req: any, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.update(projectApiKeys).set({
      cooldownUntil: null,
      status: "HEALTHY",
      failureReason: null
    }).where(and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId)));
    res.json({ success: true, message: "Cooldown cleared successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to clear cooldown" });
  }
});

router.patch("/api-keys/:keyId/primary", async (req: any, res: Response) => {
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

// Upgraded Analytics Endpoint
/**
 * GET /projects/:projectId/widget/analytics/stream
 * Real-time SSE Live Activity & Analytics Stream for the Chatbot Analytics screen
 */
router.get("/analytics/stream", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Initial connection handshake
  res.write(`data: ${JSON.stringify({ type: "connected", projectId, timestamp: new Date().toISOString() })}\n\n`);

  // Subscribe to real-time events for this authorized project
  const unsubscribe = activityBus.subscribe(projectId, (event: ActivityItem) => {
    try {
      res.write(`data: ${JSON.stringify({ type: "activity", data: event, timestamp: new Date().toISOString() })}\n\n`);
    } catch {
      // client connection closed
    }
  });

  // Keepalive ping every 15s to keep proxy connections alive
  const keepalive = setInterval(() => {
    try {
      res.write(`: keepalive\n\n`);
    } catch {
      clearInterval(keepalive);
    }
  }, 15000);

  // Periodic active user pulse every 5 seconds
  const pulseInterval = setInterval(async () => {
    try {
      if (isDemoProjectId(projectId)) {
        res.write(`data: ${JSON.stringify({ type: "pulse", activeNow: 4, timestamp: new Date().toISOString() })}\n\n`);
        return;
      }
      const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
      const [activeSessionsRes] = await db.select({
        count: sql<number>`count(distinct ${chatSessions.id})`.mapWith(Number)
      })
      .from(chatSessions)
      .where(and(
        eq(chatSessions.projectId, projectId as any),
        sql`(${chatSessions.createdAt} >= ${activeCutoff} OR EXISTS (
          SELECT 1 FROM ${messages} 
          WHERE ${messages.sessionId} = ${chatSessions.id} 
          AND ${messages.createdAt} >= ${activeCutoff}
        ))`,
        sql`(${chatSessions.expiresAt} IS NULL OR ${chatSessions.expiresAt} > now())`
      ));
      res.write(`data: ${JSON.stringify({ type: "pulse", activeNow: activeSessionsRes?.count || 0, timestamp: new Date().toISOString() })}\n\n`);
    } catch {
      // ignore
    }
  }, 5000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(keepalive);
    clearInterval(pulseInterval);
  });
});

router.get("/analytics", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const timeframe = (req.query.timeframe as string) || "7d"; // 24h, 7d, 30d, 90d, all

  // Demo Project Mode Handling
  if (isDemoProjectId(projectId)) {
    const demoDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const timeSeries = demoDays.map((d, i) => ({
      date: d,
      rawDate: new Date(Date.now() - (6 - i) * 86400000).toISOString().split("T")[0],
      conversations: 42 + i * 6,
      messages: 198 + i * 28,
      uniqueVisitors: 68 + i * 8,
      tokenUsage: 78000 + i * 11000,
      aiCost: Number(((78000 + i * 11000) * 0.00000015).toFixed(4)),
      responseTimeMs: 380 + (i % 3) * 20,
    }));

    const demoFeedback = [
      { id: "demo-fb-1", category: "AI_RESPONSE_LIKE", comment: "Instant and accurate answer regarding digital transformation offerings.", createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: "demo-fb-2", category: "SUGGESTION", comment: "Would love a direct WhatsApp booking link right in the chatbot window.", createdAt: new Date(Date.now() - 7200000).toISOString() },
      { id: "demo-fb-3", category: "AI_RESPONSE_LIKE", comment: "Very helpful overview of corporate AI security practices.", createdAt: new Date(Date.now() - 14400000).toISOString() }
    ];

    const demoRecentActivity = [
      { id: "act-1", type: "lead", title: "Lead Captured: Sarah Connor", detail: "sarah@cyberdyne.com • Cyberdyne Systems", timestamp: new Date().toISOString() },
      { id: "act-2", type: "message", title: "Incoming Visitor Query", detail: "What are your enterprise AI automation consulting packages?", timestamp: new Date(Date.now() - 120000).toISOString() },
      { id: "act-3", type: "ai_response", title: "AI Assistant Response", detail: "Apex Dynamics provides end-to-end AI advisory and custom model deployment...", timestamp: new Date(Date.now() - 110000).toISOString() },
      { id: "act-4", type: "lead", title: "High-Intent Lead: Marcus Wright", detail: "marcus@resistance.org • +1 (555) 019-2834", timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: "act-5", type: "tool_execution", title: "Tool Executed: Calendar Booking Sync", detail: "Status: COMPLETED • Lead ID #24", timestamp: new Date(Date.now() - 5400000).toISOString() }
    ];

    const demoLeads = [
      { id: "demo-lead-1", name: "Sarah Connor", email: "sarah@cyberdyne.com", phone: "+1 (555) 019-8234", company: "Cyberdyne Systems", status: "QUALIFIED", score: "HIGH", scoreValue: 92, userIntent: "pricing", notes: "Interested in enterprise AI workflow automation. Requested quote.", createdAt: new Date().toISOString() },
      { id: "demo-lead-2", name: "Marcus Wright", email: "marcus@resistance.org", phone: "+1 (555) 019-2834", company: "Resistance Media", status: "CONTACTED", score: "HIGH", scoreValue: 88, userIntent: "demo", notes: "Requested product walkthrough for corporate migration.", createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: "demo-lead-3", name: "Elena Rostova", email: "elena@vanguard.io", phone: "+44 20 7946 0912", company: "Vanguard Tech", status: "NEW", score: "MEDIUM", scoreValue: 65, userIntent: "sales", notes: "Exploring custom chatbot deployment on corporate intranet.", createdAt: new Date(Date.now() - 172800000).toISOString() },
      { id: "demo-lead-4", name: "David Kim", email: "dkim@quantum.kr", phone: null, company: "Quantum Labs", status: "CONVERTED", score: "HIGH", scoreValue: 95, userIntent: "purchase", notes: "Closed annual enterprise license.", createdAt: new Date(Date.now() - 259200000).toISOString() }
    ];

    const demoPeakHours = Array.from({ length: 24 }, (_, h) => ({
      hour: `${h.toString().padStart(2, "0")}:00`,
      hourNum: h,
      messages: [12, 5, 2, 1, 0, 2, 8, 25, 48, 72, 85, 94, 88, 92, 104, 98, 86, 74, 62, 54, 42, 35, 24, 18][h] || 0
    }));

    return res.json({
      totalConversations: 342,
      totalMessages: 1840,
      uniqueVisitors: 1240,
      tokenUsage: 588800,
      aiCost: "0.0883",
      avgResponseTimeMs: 395,
      activeUsersNow: 4,
      summary: {
        totalConversations: 342,
        totalMessages: 1840,
        uniqueVisitors: 1240,
        tokenUsage: 588800,
        aiCost: "0.0883",
        avgResponseTimeMs: 395,
        capturedLeads: 28,
        highIntentLeads: 12,
        conversionRate: "2.3",
        avgMessagesPerConv: "5.4",
        activeToday: 38,
        activeNow: 4,
        satisfactionRate: 98,
        resolutionRate: 96,
        pipeline: { NEW: 12, CONTACTED: 8, QUALIFIED: 5, CONVERTED: 3, LOST: 0 },
        intents: { pricing: 12, demo: 8, sales: 5, support: 2, general: 1 }
      },
      timeframe,
      timeSeries,
      topQuestions: [
        { id: "demo-fq-1", questionText: "What are your enterprise consulting rates?", count: 48, category: "Pricing" },
        { id: "demo-fq-2", questionText: "How do you integrate with corporate databases?", count: 35, category: "Integration" },
        { id: "demo-fq-3", questionText: "Can the AI handle customer support in multiple languages?", count: 29, category: "Capabilities" },
        { id: "demo-fq-4", questionText: "Is client training data kept private and SOC2 compliant?", count: 24, category: "Security" },
        { id: "demo-fq-5", questionText: "What is your onboarding and rollout timeline?", count: 18, category: "Onboarding" }
      ],
      unansweredQuestions: [
        { id: "demo-gap-1", questionText: "Do you have on-premise air-gapped GPU server deployments?", askedCount: 3, isResolved: false, reason: "Specific infrastructure detail missing" },
        { id: "demo-gap-2", questionText: "What are your custom SLA refund terms?", askedCount: 2, isResolved: true, reason: "Legal policy query" }
      ],
      recentActivity: demoRecentActivity,
      leads: demoLeads,
      feedback: demoFeedback,
      csat: { score: 98, totalLikes: 78, totalDislikes: 2, totalFeedback: 80 },
      resolutionRate: 96,
      pipeline: { NEW: 12, CONTACTED: 8, QUALIFIED: 5, CONVERTED: 3, LOST: 0 },
      intentDistribution: { pricing: 12, demo: 8, sales: 5, support: 2, general: 1 },
      peakHours: demoPeakHours,
      conversionFunnel: [
        { stage: "Website Visitors", count: 1240, dropoff: "100%" },
        { stage: "Started Chats", count: 342, dropoff: "27.6%" },
        { stage: "Engaged Conversations", count: 285, dropoff: "83.3%" },
        { stage: "Captured Leads", count: 28, dropoff: "9.8%" },
        { stage: "High-Intent Deals", count: 12, dropoff: "42.9%" },
        { stage: "Converted Customers", count: 3, dropoff: "25.0%" }
      ]
    });
  }

  try {
    // 1. Fetch aggregate metrics from widgetAnalytics
    const analytics = await db.select({
      totalConversations: sql<number>`sum(${widgetAnalytics.conversations})`.mapWith(Number),
      totalMessages: sql<number>`sum(${widgetAnalytics.messages})`.mapWith(Number),
      uniqueVisitors: sql<number>`sum(${widgetAnalytics.uniqueVisitors})`.mapWith(Number),
      tokenUsage: sql<number>`sum(${widgetAnalytics.tokenUsage})`.mapWith(Number),
      avgResponseTimeMs: sql<number>`avg(${widgetAnalytics.responseTimeMs})`.mapWith(Number),
    })
    .from(widgetAnalytics)
    .where(eq(widgetAnalytics.projectId, projectId as any));

    // 2. Fetch session count from chatSessions
    const sessionCountRes = await db.select({
      count: sql<number>`count(*)`.mapWith(Number)
    })
    .from(chatSessions)
    .where(eq(chatSessions.projectId, projectId as any));

    // 3. Fetch lead count and high-intent leads count
    const leadsRes = await db.select({
      count: sql<number>`count(*)`.mapWith(Number)
    })
    .from(widgetLeads)
    .where(eq(widgetLeads.projectId, projectId as any));

    const highIntentRes = await db.select({
      count: sql<number>`count(*)`.mapWith(Number)
    })
    .from(widgetLeads)
    .where(and(
      eq(widgetLeads.projectId, projectId as any),
      eq(widgetLeads.score, "HIGH")
    ));

    const totalLeadsCount = leadsRes[0]?.count || 0;
    const highIntentLeadsCount = highIntentRes[0]?.count || 0;

    const baseTotalConversations = Math.max(analytics[0]?.totalConversations || 0, sessionCountRes[0]?.count || 0);
    const totalMessages = Math.max(analytics[0]?.totalMessages || 0, baseTotalConversations > 0 ? baseTotalConversations * 2 : 0);
    const uniqueVisitors = Math.max(analytics[0]?.uniqueVisitors || 0, baseTotalConversations);
    const tokenUsage = analytics[0]?.tokenUsage || (totalMessages * 320);
    const rawCost = (tokenUsage * 0.00000015);
    const aiCostFormatted = rawCost.toFixed(4);
    const avgResponseTimeMs = Math.round(analytics[0]?.avgResponseTimeMs || 350);

    const conversionDenominator = uniqueVisitors > 0 ? uniqueVisitors : baseTotalConversations;
    const conversionRate = conversionDenominator > 0
      ? ((totalLeadsCount / conversionDenominator) * 100).toFixed(1)
      : "0.0";
      
    const avgMessagesPerConv = baseTotalConversations > 0
      ? (totalMessages / baseTotalConversations).toFixed(1)
      : "0.0";

    // 4. CSAT (Satisfaction Score) & Feedback Counts
    let totalLikes = 0;
    let totalDislikes = 0;
    try {
      const [likesRes] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(messageFeedback)
        .where(and(eq(messageFeedback.projectId, projectId as any), eq(messageFeedback.type, "LIKE")));
      const [dislikesRes] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(messageFeedback)
        .where(and(eq(messageFeedback.projectId, projectId as any), eq(messageFeedback.type, "DISLIKE")));
      totalLikes = likesRes?.count || 0;
      totalDislikes = dislikesRes?.count || 0;
    } catch {
      // fallback
    }

    const totalFeedbackCount = totalLikes + totalDislikes;
    const satisfactionRate = totalFeedbackCount > 0
      ? Math.round((totalLikes / totalFeedbackCount) * 100)
      : (baseTotalConversations > 0 ? 98 : 100);

    // 5. Bot Resolution Rate
    let unresolvedGapsCount = 0;
    try {
      const [unresolvedRes] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(knowledgeGaps)
        .where(and(eq(knowledgeGaps.projectId, projectId as any), eq(knowledgeGaps.isResolved, false)));
      unresolvedGapsCount = unresolvedRes?.count || 0;
    } catch {
      // fallback
    }

    const resolutionRate = baseTotalConversations > 0
      ? Math.max(0, Math.min(100, Math.round(((baseTotalConversations - Math.min(baseTotalConversations, unresolvedGapsCount)) / baseTotalConversations) * 100)))
      : 100;

    // 6. Lead Pipeline Stages Breakdown
    const pipeline = {
      NEW: 0,
      CONTACTED: 0,
      QUALIFIED: 0,
      CONVERTED: 0,
      LOST: 0
    };

    try {
      const pipelineRows = await db.select({
        status: widgetLeads.status,
        count: sql<number>`count(*)`.mapWith(Number)
      })
      .from(widgetLeads)
      .where(eq(widgetLeads.projectId, projectId as any))
      .groupBy(widgetLeads.status);

      for (const row of pipelineRows) {
        const st = (row.status || "NEW").toUpperCase();
        if ((pipeline as any)[st] !== undefined) {
          (pipeline as any)[st] = row.count;
        }
      }
    } catch {
      // fallback
    }

    // 7. Lead Intent Distribution
    const intentDistribution: Record<string, number> = {
      pricing: 0,
      demo: 0,
      sales: 0,
      support: 0,
      general: 0
    };

    try {
      const intentRows = await db.select({
        intent: widgetLeads.userIntent,
        count: sql<number>`count(*)`.mapWith(Number)
      })
      .from(widgetLeads)
      .where(eq(widgetLeads.projectId, projectId as any))
      .groupBy(widgetLeads.userIntent);

      for (const row of intentRows) {
        const key = (row.intent || "general").toLowerCase();
        if (intentDistribution[key] !== undefined) {
          intentDistribution[key] += row.count;
        } else {
          intentDistribution.general += row.count;
        }
      }
    } catch {
      // fallback
    }

    // 8. Peak Traffic Hours (00:00 to 23:00)
    let peakHours: Array<{ hour: string; hourNum: number; messages: number }> = [];
    try {
      const hourlyActivity = await db.select({
        hour: sql<number>`extract(hour from ${messages.createdAt})`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number)
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(eq(chatSessions.projectId, projectId as any))
      .groupBy(sql`extract(hour from ${messages.createdAt})`);

      peakHours = Array.from({ length: 24 }, (_, h) => {
        const match = hourlyActivity.find(r => r.hour === h);
        return {
          hour: `${h.toString().padStart(2, "0")}:00`,
          hourNum: h,
          messages: match ? match.count : 0
        };
      });
    } catch {
      peakHours = Array.from({ length: 24 }, (_, h) => ({
        hour: `${h.toString().padStart(2, "0")}:00`,
        hourNum: h,
        messages: 0
      }));
    }

    // 9. Time Series Breakdown (Hourly for 24h, Daily for 7d/30d/90d/all)
    const timeSeries = [];
    const now = new Date();

    if (timeframe === "24h") {
      const past24h = new Date(Date.now() - 24 * 3600 * 1000);
      let hourlyMessagesMap = new Map<number, number>();

      try {
        const hourlyMsgRows = await db.select({
          hour: sql<number>`extract(hour from ${messages.createdAt})`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number)
        })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(and(
          eq(chatSessions.projectId, projectId as any),
          gte(messages.createdAt, past24h)
        ))
        .groupBy(sql`extract(hour from ${messages.createdAt})`);

        for (const row of hourlyMsgRows) {
          hourlyMessagesMap.set(row.hour, row.count);
        }
      } catch {
        // ignore
      }

      for (let i = 23; i >= 0; i--) {
        const hDate = new Date(Date.now() - i * 3600 * 1000);
        const hourNum = hDate.getHours();
        const hourLabel = `${hourNum.toString().padStart(2, "0")}:00`;
        const count = hourlyMessagesMap.get(hourNum) || 0;
        const convCount = Math.max(0, Math.ceil(count / 2));
        const tokens = count * 280;

        timeSeries.push({
          date: hourLabel,
          rawDate: hDate.toISOString(),
          conversations: convCount,
          messages: count,
          uniqueVisitors: convCount,
          tokenUsage: tokens,
          aiCost: Number((tokens * 0.00000015).toFixed(4)),
          responseTimeMs: avgResponseTimeMs,
        });
      }
    } else {
      let daysCount = 7;
      if (timeframe === "30d") daysCount = 30;
      else if (timeframe === "90d") daysCount = 90;
      else if (timeframe === "all") daysCount = 60;

      const startDate = new Date();
      startDate.setUTCHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - (daysCount - 1));

      const dailyAnalyticsRows = await db.select()
        .from(widgetAnalytics)
        .where(
          and(
            eq(widgetAnalytics.projectId, projectId as any),
            gte(widgetAnalytics.date, startDate)
          )
        );

      const dailyMap = new Map<string, any>();
      for (const row of dailyAnalyticsRows) {
        const key = new Date(row.date).toISOString().split('T')[0];
        dailyMap.set(key, row);
      }

      now.setUTCHours(0, 0, 0, 0);

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const isoDate = d.toISOString().split('T')[0];
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const row = dailyMap.get(isoDate);

        const dayConversations = row ? row.conversations : 0;
        const dayMessages = row ? row.messages : 0;
        const dayTokens = row ? row.tokenUsage : 0;
        const dayCost = Number((dayTokens * 0.00000015).toFixed(4));
        const dayLatency = row?.responseTimeMs || 350;

        timeSeries.push({
          date: dateLabel,
          rawDate: isoDate,
          conversations: dayConversations,
          messages: dayMessages,
          uniqueVisitors: row ? row.uniqueVisitors : dayConversations,
          tokenUsage: dayTokens,
          aiCost: dayCost,
          responseTimeMs: dayLatency,
        });
      }
    }

    // 10. Fetch Top Questions from frequentQuestions
    const topQuestions = await db.query.frequentQuestions.findMany({
      where: eq(frequentQuestions.projectId, projectId as any),
      orderBy: (frequentQuestions, { desc }) => [desc(frequentQuestions.count)],
      limit: 25,
    });

    // 11. Fetch Unanswered Questions from knowledgeGaps
    const unansweredQuestions = await db.query.knowledgeGaps.findMany({
      where: eq(knowledgeGaps.projectId, projectId as any),
      orderBy: (knowledgeGaps, { desc }) => [desc(knowledgeGaps.askedCount)],
      limit: 25,
    });

    // 12. Fetch Leads List
    const leadsList = await db.query.widgetLeads.findMany({
      where: eq(widgetLeads.projectId, projectId as any),
      orderBy: (widgetLeads, { desc }) => [desc(widgetLeads.createdAt)],
      limit: 50,
    });

    // 13. Recent Activity Feed
    const recentMessages = await db.select({
      id: messages.id,
      content: messages.content,
      sender: messages.sender,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
    .where(eq(chatSessions.projectId, projectId as any))
    .orderBy(desc(messages.createdAt))
    .limit(20);

    const auditList = await db.select()
      .from(enterpriseAuditLogs)
      .where(eq(enterpriseAuditLogs.projectId, projectId as any))
      .orderBy(desc(enterpriseAuditLogs.timestamp))
      .limit(10);

    const recentActivity = [];
    for (const lead of leadsList) {
      recentActivity.push({
        id: `lead-${lead.id}`,
        type: "lead",
        title: `Lead Captured: ${lead.name || lead.email || "Visitor"}`,
        detail: [lead.email, lead.phone, lead.company].filter(Boolean).join(" • ") || "Contact information saved",
        timestamp: lead.createdAt ? new Date(lead.createdAt).toISOString() : new Date().toISOString(),
      });
    }

    for (const msg of recentMessages) {
      recentActivity.push({
        id: `msg-${msg.id}`,
        type: msg.sender === "user" ? "message" : "ai_response",
        title: msg.sender === "user" ? "Incoming Visitor Query" : "AI Assistant Response",
        detail: msg.content.length > 80 ? msg.content.substring(0, 80) + "..." : msg.content,
        timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
      });
    }

    for (const audit of auditList) {
      const details = (audit.details as any) || {};
      const actionName = details.actionName || details.toolExecuted || audit.actionType;
      recentActivity.push({
        id: `audit-${audit.id}`,
        type: "tool_execution",
        title: `Tool Executed: ${actionName}`,
        detail: details.providerName ? `Provider: ${details.providerName} • Status: ${details.status || "COMPLETED"}` : `Status: ${details.status || "COMPLETED"}`,
        timestamp: audit.timestamp ? new Date(audit.timestamp).toISOString() : new Date().toISOString(),
      });
    }

    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 14. Fetch Feedback
    let feedbackList: any[] = [];
    try {
      feedbackList = await db.query.projectFeedback.findMany({
        where: (pf, { eq, and, or, like }) => and(eq(pf.projectId, projectId), or(like(pf.category, "AI_RESPONSE_%"), eq(pf.category, "SUGGESTION"))),
        orderBy: (pf, { desc }) => [desc(pf.createdAt)],
        limit: 50
      });
    } catch (err) {
      req.log.warn(err, "Failed to fetch project feedback for analytics");
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);

    const [activeSessionsNowRes] = await db.select({
      count: sql<number>`count(distinct ${chatSessions.id})`.mapWith(Number)
    })
    .from(chatSessions)
    .where(and(
      eq(chatSessions.projectId, projectId as any),
      sql`(${chatSessions.createdAt} >= ${activeCutoff} OR EXISTS (
        SELECT 1 FROM ${messages} 
        WHERE ${messages.sessionId} = ${chatSessions.id} 
        AND ${messages.createdAt} >= ${activeCutoff}
      ))`,
      sql`(${chatSessions.expiresAt} IS NULL OR ${chatSessions.expiresAt} > now())`
    ));

    const [activeTodayRes] = await db.select({
      count: sql<number>`count(distinct ${chatSessions.id})`.mapWith(Number)
    })
    .from(chatSessions)
    .where(and(
      eq(chatSessions.projectId, projectId as any),
      gte(chatSessions.createdAt, todayStart)
    ));

    const activeTodayCount = Math.max(activeTodayRes?.count || 0, timeSeries[timeSeries.length - 1]?.conversations || 0);
    const activeUsersNow = activeSessionsNowRes?.count || 0;

    // 15. Conversion Funnel
    const engagedConversations = Math.min(baseTotalConversations, Math.max(0, Math.floor(baseTotalConversations * 0.82)));
    const conversionFunnel = [
      { stage: "Website Visitors", count: uniqueVisitors, dropoff: "100%" },
      { stage: "Started Chats", count: baseTotalConversations, dropoff: uniqueVisitors > 0 ? `${Math.round((baseTotalConversations / uniqueVisitors) * 100)}%` : "0%" },
      { stage: "Engaged Conversations", count: engagedConversations, dropoff: baseTotalConversations > 0 ? `${Math.round((engagedConversations / baseTotalConversations) * 100)}%` : "0%" },
      { stage: "Captured Leads", count: totalLeadsCount, dropoff: engagedConversations > 0 ? `${Math.round((totalLeadsCount / engagedConversations) * 100)}%` : "0%" },
      { stage: "High-Intent Deals", count: highIntentLeadsCount, dropoff: totalLeadsCount > 0 ? `${Math.round((highIntentLeadsCount / totalLeadsCount) * 100)}%` : "0%" },
      { stage: "Converted Customers", count: pipeline.CONVERTED, dropoff: totalLeadsCount > 0 ? `${Math.round((pipeline.CONVERTED / Math.max(1, totalLeadsCount)) * 100)}%` : "0%" },
    ];

    res.json({
      totalConversations: baseTotalConversations,
      totalMessages,
      uniqueVisitors,
      tokenUsage,
      aiCost: aiCostFormatted,
      avgResponseTimeMs,
      activeUsersNow,
      summary: {
        totalConversations: baseTotalConversations,
        totalMessages,
        uniqueVisitors,
        tokenUsage,
        aiCost: aiCostFormatted,
        avgResponseTimeMs,
        capturedLeads: totalLeadsCount,
        highIntentLeads: highIntentLeadsCount,
        conversionRate,
        avgMessagesPerConv,
        activeToday: activeTodayCount,
        activeNow: activeUsersNow,
        satisfactionRate,
        resolutionRate,
        pipeline,
        intents: intentDistribution
      },
      timeframe,
      timeSeries,
      topQuestions,
      unansweredQuestions,
      recentActivity: recentActivity.slice(0, 30),
      leads: leadsList,
      feedback: feedbackList,
      csat: { score: satisfactionRate, totalLikes, totalDislikes, totalFeedback: totalFeedbackCount },
      resolutionRate,
      pipeline,
      intentDistribution,
      peakHours,
      conversionFunnel,
    });
  } catch (error) {
    req.log.error(error, "Analytics fetch error");
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Leads List
router.get("/leads", async (req: any, res: Response) => {
  const { projectId } = req.params;
  try {
    const leads = await db.query.widgetLeads.findMany({
      where: eq(widgetLeads.projectId, projectId as any),
      orderBy: (widgetLeads, { desc }) => [desc(widgetLeads.createdAt)]
    });
    res.json(leads);
  } catch (error) {
    req.log.error(error, "Leads fetch error");
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// Create Lead (Manual entry)
router.post("/leads", async (req: any, res: Response) => {
  const { projectId } = req.params;
  const { name, email, phone, company, notes, status, score } = req.body;
  try {
    const [lead] = await db.insert(widgetLeads).values({
      projectId: projectId as any,
      name: name || "Anonymous Lead",
      email: email || null,
      phone: phone || null,
      company: company || null,
      notes: notes || null,
      status: status || "NEW",
      score: score || ((email || phone) ? "HIGH" : "MEDIUM"),
      scoreValue: score === "HIGH" ? 80 : score === "LOW" ? 30 : 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    try {
      emitActivityEvent({
        projectId,
        type: "lead",
        title: `New Lead Captured: ${lead.name || lead.email || "Visitor"}`,
        detail: [lead.email, lead.phone, lead.company].filter(Boolean).join(" • ") || "Manually captured lead",
        metadata: { leadId: lead.id, status: lead.status, score: lead.score }
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to emit lead creation activity");
    }

    res.json(lead);
  } catch (error) {
    req.log.error(error, "Failed to create lead");
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// Update Lead Status / Notes / Details
router.patch("/leads/:leadId", async (req: any, res: Response) => {
  const { projectId, leadId } = req.params;
  const { name, email, phone, company, notes, status, score, scoreValue } = req.body;

  try {
    const existing = await db.query.widgetLeads.findFirst({
      where: and(
        eq(widgetLeads.id, leadId as any),
        eq(widgetLeads.projectId, projectId as any)
      )
    });

    if (!existing) {
      res.status(404).json({ error: "Lead not found or access denied" });
      return;
    }

    const [updated] = await db.update(widgetLeads)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(company !== undefined ? { company } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(score !== undefined ? { score } : {}),
        ...(scoreValue !== undefined ? { scoreValue } : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(widgetLeads.id, leadId as any),
        eq(widgetLeads.projectId, projectId as any)
      ))
      .returning();

    try {
      emitActivityEvent({
        projectId,
        type: "lead",
        title: `Lead Updated: ${updated.name || updated.email || "Lead"}`,
        detail: `Status: ${updated.status} • Score: ${updated.score}`,
        metadata: { leadId: updated.id, status: updated.status, score: updated.score }
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to emit lead update activity");
    }

    res.json(updated);
  } catch (error) {
    req.log.error(error, "Failed to update lead");
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// Delete Lead
router.delete("/leads/:leadId", async (req: any, res: Response) => {
  const { projectId, leadId } = req.params;
  try {
    await db.delete(widgetLeads).where(
      and(
        eq(widgetLeads.id, leadId as any),
        eq(widgetLeads.projectId, projectId as any)
      )
    );

    try {
      emitActivityEvent({
        projectId,
        type: "lead",
        title: "Lead Removed",
        detail: `Lead record removed from CRM`,
        metadata: { leadId }
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to emit lead deletion activity");
    }

    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (error) {
    req.log.error(error, "Failed to delete lead");
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// Top Frequent Questions Endpoint
router.get("/top-questions", async (req: any, res: Response) => {
  const { projectId } = req.params;
  try {
    const questions = await db.query.frequentQuestions.findMany({
      where: eq(frequentQuestions.projectId, projectId as any),
      orderBy: (frequentQuestions, { desc }) => [desc(frequentQuestions.count)],
      limit: 50,
    });
    res.json(questions);
  } catch (error) {
    req.log.error(error, "Failed to fetch top questions");
    res.status(500).json({ error: "Failed to fetch top questions" });
  }
});

// Unanswered Questions (Knowledge Gaps) Endpoint
router.get("/unanswered-questions", async (req: any, res: Response) => {
  const { projectId } = req.params;
  try {
    const gaps = await db.query.knowledgeGaps.findMany({
      where: eq(knowledgeGaps.projectId, projectId as any),
      orderBy: (knowledgeGaps, { desc }) => [desc(knowledgeGaps.askedCount)],
      limit: 50,
    });
    res.json(gaps);
  } catch (error) {
    req.log.error(error, "Failed to fetch unanswered questions");
    res.status(500).json({ error: "Failed to fetch unanswered questions" });
  }
});

// Resolve Knowledge Gap
router.patch("/unanswered-questions/:gapId/resolve", async (req: any, res: Response) => {
  const { projectId, gapId } = req.params;
  try {
    const [updated] = await db.update(knowledgeGaps)
      .set({
        isResolved: true,
        updatedAt: new Date(),
      })
      .where(and(
        eq(knowledgeGaps.id, gapId as any),
        eq(knowledgeGaps.projectId, projectId as any)
      ))
      .returning();

    try {
      emitActivityEvent({
        projectId,
        type: "handoff",
        title: "Knowledge Gap Resolved",
        detail: `Resolved query: "${(updated.questionText || "").slice(0, 50)}"`,
        metadata: { gapId: updated.id }
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to emit gap resolution activity");
    }

    res.json(updated);
  } catch (error) {
    req.log.error(error, "Failed to resolve knowledge gap");
    res.status(500).json({ error: "Failed to resolve knowledge gap" });
  }
});

// AI CSS Generator (Optional)
router.post("/generate-css", entitlementGuard(), async (req: any, res: Response) => {
  const { projectId } = req.params;
  const userId = (req as any).auth?.userId ?? null;
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const systemPrompt = `You are an expert UI/UX designer and CSS assistant for a chat widget.
Your goal is to generate clean, valid, and beautiful CSS code that changes the look and feel of the widget based on the user's instructions.

The widget has the following DOM structure and class selectors:
- .widget-wrapper (the overall fixed position outer container)
- .chat-panel (the open/active chat card container)
- .header (chat panel header bar)
- .avatar (the circular badge with the bot initial)
- .title (the bot's name text)
- .subtitle (the online status text indicator)
- .close-btn (the header button to close the panel)
- .messages (the scrolling message history container)
- .message (a message bubble base class)
- .message.bot (bot message bubble specifically)
- .message.user (user message bubble specifically)
- .input-area (the bottom container for form and elements)
- .input-wrapper (the form container that wraps the input box and send button)
- .input-wrapper input (the text input field, NOT a textarea)
- .send-btn (the button inside the input area to submit messages)
- .floating-button (the FAB launcher button shown when the widget is closed)

CSS Custom properties (variables) defined on :host:
- --primary: theme primary color (used for header, user bubble, send btn, launcher button)
- --bg-dark: background of the messages container
- --bg-panel: background of the panel card and bot message bubbles
- --border: border colors between header, messages, and input
- --text-main: core text color
- --text-muted: secondary or muted text color

User request: "${prompt}"

Rules:
1. ONLY return the valid CSS code block.
2. DO NOT wrap the output in markdown block code markers like \`\`\`css ... \`\`\`.
3. DO NOT include explanations, introductions, or warnings. Return ONLY CSS.
4. Use "!important" on CSS properties to ensure they override the default widget styles.
5. If the request is impossible or malicious, return empty string or default styling overrides.`;

    const aiRes = await ai.models.generateContent(userId, {
      model: undefined,
      contents: systemPrompt,
      projectId,
    });

    let cssText = aiRes.text || "";
    // Clean up in case Gemini still outputs markdown code fences
    cssText = cssText.replace(/```css/g, "").replace(/```/g, "").trim();

    // Validate that AI output looks like actual CSS and not error logs/stack traces
    if (cssText && looksLikeNonCSS(cssText)) {
      req.log.warn("AI CSS generation returned non-CSS content, discarding.");
      return res.json({ css: "/* AI generation failed: invalid output. Please try again. */" });
    }

    return res.json({ css: cssText });
  } catch (error: any) {
    req.log.error(error, "AI CSS Generation failed");
    // Graceful error indicator for missing/unhealthy keys
    if (error?.code === "NO_HEALTHY_KEYS" || error?.status === 503 || error?.status === 403 || error?.status === 429) {
      return res.status(200).json({ 
        error: "AI service is unavailable. Please check your Gemini API key configuration.", 
        code: "AI_DISABLED" 
      });
    }
    // Never expose raw error.message to the client â€” it may contain stack traces, SQL, or internal paths
    return res.status(500).json({ error: "Failed to generate CSS. Please try again later." });
  }
});

/**
 * Detect if text is likely backend logs, stack traces, SQL, or JSON error payloads
 * rather than valid CSS. Used as a server-side guard before returning AI output.
 */
function looksLikeNonCSS(text: string): boolean {
  // JSON object/array
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try { JSON.parse(text); return true; } catch (_) {}
  }
  // Stack traces
  if (/\bat\s+[a-zA-Z0-9_$<>#.-]+\s+\(/.test(text)) return true;
  // SQL statements
  if (/\b(SELECT\s+[\s\S]*?\s+FROM|INSERT\s+INTO|UPDATE\s+[\s\S]*?\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(text)) return true;
  // Node/server file paths
  if (/(?:\s|^)\/(?:opt|usr|home|var|tmp|node_modules)\//.test(text)) return true;
  if (/[a-zA-Z]:\\[a-zA-Z0-9_.-]+(?:\\[a-zA-Z0-9_.-]+)+/.test(text)) return true;
  // Pino/Fastify/Express JSON log lines  
  if (/"level":\s*\d+/.test(text) && /"time":\s*\d+/.test(text)) return true;
  // Error: prefix followed by technical content
  if (/^Error:.*\n\s+at\s+/m.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Context Settings (Website Context Engine)
// ---------------------------------------------------------------------------

router.get("/context-settings", entitlementGuard(), async (req: any, res: Response): Promise<any> => {
  const projectId = (req.params.projectId || req.query.projectId || "") as string;
  try {
    req.log.info({ projectId }, "Project ID");

    const defaultSettings = {
      projectId,
      enabled: true,
      dashboardAnalysis: true,
      formAssistant: true,
      tableAnalysis: true,
      navigationAssistant: true,
      knowledgeComparison: true,
      mistakeDetection: true,
      contextMemory: true,
      developerDebugMode: false,
      maxContextSizeBytes: 6144
    };

    let settings;
    try {
      settings = await db.query.projectContextSettings.findFirst({
        where: eq(projectContextSettings.projectId, projectId)
      });
    } catch (dbError) {
      req.log.warn(dbError, "Database query failed (table might be missing)");
      return res.json(defaultSettings);
    }

    if (!settings) {
      try {
        await db.insert(projectContextSettings).values(defaultSettings as any);
        settings = await db.query.projectContextSettings.findFirst({
          where: eq(projectContextSettings.projectId, projectId)
        });
      } catch (insertError: any) {
        req.log.error(insertError, `Failed to insert default context settings for project ${projectId}`);
        return res.json(defaultSettings);
      }
    }

    return res.json(settings || defaultSettings);
  } catch (error: any) {
    req.log.error(error, "GET /context-settings error");
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

router.put("/context-settings", entitlementGuard(), async (req: any, res: Response): Promise<any> => {
  const projectId = (req.params.projectId || req.query.projectId || "") as string;
  const updates = req.body;
  
  try {
    req.log.info({ projectId }, "Project ID");
    const safeUpdates: any = {};
    const allowedKeys = [
      "enabled", "dashboardAnalysis", "formAssistant", "tableAnalysis", 
      "navigationAssistant", "knowledgeComparison", "mistakeDetection", 
      "contextMemory", "developerDebugMode", "maxContextSizeBytes"
    ];
    
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }
    
    safeUpdates.updatedAt = new Date();

    let result;
    try {
      result = await db.update(projectContextSettings)
        .set(safeUpdates)
        .where(eq(projectContextSettings.projectId, projectId))
        .returning();
    } catch (updateError) {
      req.log.warn(updateError, "Update failed (table might be missing)");
      return res.json({ projectId, ...safeUpdates });
    }

    if (!result || result.length === 0) {
      const newSettings = {
        projectId,
        ...safeUpdates
      };
      try {
        const insertResult = await db.insert(projectContextSettings)
          .values(newSettings as any)
          .returning();
        return res.json(insertResult[0]);
      } catch (insertError) {
        req.log.error(insertError, "Insert failed");
        return res.json(newSettings);
      }
    }

    return res.json(result[0]);
  } catch (error: any) {
    req.log.error(error, "PUT /context-settings error");
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

export default router;
