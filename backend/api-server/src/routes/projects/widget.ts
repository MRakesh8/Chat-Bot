import { Router, Request, Response } from "express";
import { db, crypto as dbCrypto } from "@workspace/db";
import { projectWidgetSettings, projectApiKeys, widgetAnalytics, widgetLeads, projectContextSettings, chatSessions, messages, frequentQuestions, knowledgeGaps } from "@workspace/db/schema";
import { eq, and, sql, ne, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";
import { ai } from "@workspace/integrations-gemini-ai";
import { authorizeMembership } from "../../middlewares/authorizeMembership";
import { entitlementGuard } from "../../security";
import { isDemoProjectId, getDemoWidgetSettings } from "../../services/demo-project";

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
router.get("/api-keys", async (req: any, res: Response) => {
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

router.put("/api-keys/:keyId", async (req: any, res: Response) => {
  const { projectId, keyId } = req.params;
  const { model } = req.body;
  try {
    const existing = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.id, keyId as any), eq(projectApiKeys.projectId, projectId))
    });
    if (!existing) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    // Validate if the model is in availableModels
    if (model && existing.availableModels && Array.isArray(existing.availableModels)) {
      if (!existing.availableModels.includes(model)) {
        res.status(400).json({ error: `Model ${model} is not supported by this API key.` });
        return;
      }
    }

    await db.update(projectApiKeys).set({ model }).where(and(
      eq(projectApiKeys.id, keyId as any),
      eq(projectApiKeys.projectId, projectId)
    ));
    res.json({ success: true, message: "Key updated" });
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

    const decryptedKey = dbCrypto.decrypt(key.encryptedKey) || key.encryptedKey;
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
    
    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey || existing.encryptedKey, existing.provider);
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
router.get("/analytics", async (req: any, res: Response) => {
  const { projectId } = req.params;
  const timeframe = (req.query.timeframe as string) || "7d"; // 24h, 7d, 30d, all

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

    // Instruction 8: Conversion Rate = Captured Leads / Unique Visitors (or total conversations if 0)
    const conversionDenominator = uniqueVisitors > 0 ? uniqueVisitors : baseTotalConversations;
    const conversionRate = conversionDenominator > 0
      ? ((totalLeadsCount / conversionDenominator) * 100).toFixed(1)
      : "0.0";
      
    const avgMessagesPerConv = baseTotalConversations > 0
      ? (totalMessages / baseTotalConversations).toFixed(1)
      : "0.0";

    // 4. Daily breakdown rows from widgetAnalytics
    let daysCount = 7;
    if (timeframe === "24h") daysCount = 1;
    else if (timeframe === "30d") daysCount = 30;
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

    const timeSeries = [];
    const now = new Date();
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

    // 5. Fetch Top Questions from frequentQuestions
    const topQuestions = await db.query.frequentQuestions.findMany({
      where: eq(frequentQuestions.projectId, projectId as any),
      orderBy: (frequentQuestions, { desc }) => [desc(frequentQuestions.count)],
      limit: 15,
    });

    // 6. Fetch Unanswered Questions from knowledgeGaps
    const unansweredQuestions = await db.query.knowledgeGaps.findMany({
      where: eq(knowledgeGaps.projectId, projectId as any),
      orderBy: (knowledgeGaps, { desc }) => [desc(knowledgeGaps.askedCount)],
      limit: 15,
    });

    // 7. Recent Activity Feed
    const leadsList = await db.query.widgetLeads.findMany({
      where: eq(widgetLeads.projectId, projectId as any),
      orderBy: (widgetLeads, { desc }) => [desc(widgetLeads.createdAt)],
      limit: 10,
    });

    const recentMessages = await db.select({
      content: messages.content,
      sender: messages.sender,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
    .where(and(
      eq(chatSessions.projectId, projectId as any),
      eq(messages.sender, "user")
    ))
    .orderBy(desc(messages.createdAt))
    .limit(10);

    const recentActivity = [];
    for (const lead of leadsList) {
      recentActivity.push({
        id: `lead-${lead.id}`,
        type: "lead",
        title: `Lead Captured: ${lead.name || lead.email || "Visitor"}`,
        detail: [lead.email, lead.phone, lead.company].filter(Boolean).join(" â€¢ ") || "Contact information saved",
        timestamp: lead.createdAt.toISOString(),
      });
    }

    for (const msg of recentMessages) {
      recentActivity.push({
        id: `msg-${Math.random().toString(36).substring(7)}`,
        type: "message",
        title: `Incoming Visitor Query`,
        detail: msg.content.length > 60 ? msg.content.substring(0, 60) + "..." : msg.content,
        timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
      });
    }

    // Fetch AI response & suggestion feedback safely
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

    recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      totalConversations: baseTotalConversations,
      totalMessages,
      uniqueVisitors,
      tokenUsage,
      aiCost: aiCostFormatted,
      avgResponseTimeMs,
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
        activeToday: timeSeries[timeSeries.length - 1]?.conversations || 0,
      },
      timeframe,
      timeSeries,
      topQuestions,
      unansweredQuestions,
      recentActivity: recentActivity.slice(0, 15),
      leads: leadsList,
      feedback: feedbackList,
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
