import { Router, Request, Response } from "express";
import { db, crypto } from "@workspace/db";
import { projectWidgetSettings, projects, knowledgeSources, knowledgeChunks, projectApiKeys, userApiKeys, widgetAnalytics } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { UniversalProviderAdapter } from "../services/llm-provider";
import { GoogleGenAI } from "@google/genai";
import { ai } from "@workspace/integrations-gemini-ai";
import { searchProjectKnowledge, saveAutoKnowledgeItem } from "../services/knowledge";
import { projectContextSettings } from "@workspace/db/schema";
import {
  validateWebsiteContext,
  deltaReconstructor,
  contextFuser,
  buildContextAwarePrompt,
  sessionMemoryStore
} from "../services/context-engine";

async function executeWithFallback(activeKey: string, method: 'generateContent' | 'generateContentStream', options: any): Promise<any> {
  const directClient = new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "" }
  });
  
  const FALLBACK_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];
  let requestedModel = options.model || "gemini-2.5-flash";
  if (requestedModel === "gemini-1.5-flash") {
    requestedModel = "gemini-2.5-flash";
  }
  const modelsToTry = Array.from(new Set([requestedModel, ...FALLBACK_MODELS]));
  
  for (let i = 0; i < modelsToTry.length; i++) {
    const attemptModel = modelsToTry[i];
    const isLast = i === modelsToTry.length - 1;
    try {
      const attemptOptions = { ...options, model: attemptModel };
      if (method === 'generateContent') {
        return await directClient.models.generateContent(attemptOptions);
      } else {
        return await directClient.models.generateContentStream(attemptOptions);
      }
    } catch (err: any) {
      const status = err?.status || err?.response?.status || err?.code;
      const isRetryable = status === 429 || status === 503 || status === 404 || status === 500 ||
                          err?.message?.includes("429") || err?.message?.includes("503") || err?.message?.includes("404") || err?.message?.includes("500") ||
                          err?.message?.toLowerCase().includes("timeout");
      if (isRetryable && !isLast) {
        console.warn(`Widget API error ${status} on model ${attemptModel}, falling back to next model...`);
        continue;
      }
      throw err;
    }
  }
  
  throw new Error("No healthy models available to execute");
}

interface WidgetKey {
  id?: string;
  type: 'project' | 'user' | 'system' | 'env';
  provider: string;
  model?: string;
  decryptedKey: string;
  rawDbKey?: any;
}

async function fetchAndManageWidgetKeys(projectId: string, userId: string | null): Promise<WidgetKey[]> {
  const now = new Date();
  const widgetKeys: WidgetKey[] = [];

  try {
    // 1. Project Keys
    const projectKeysList = await db.query.projectApiKeys.findMany({
      where: eq(projectApiKeys.projectId, projectId)
    });

    for (const key of projectKeysList) {
      if (!key.isEnabled) continue;
      
      let status = key.status;
      if ((status === "COOLDOWN" || status === "QUOTA_EXCEEDED" || status === "UNHEALTHY") && key.cooldownUntil && now > key.cooldownUntil) {
        status = "HEALTHY";
        await db.update(projectApiKeys).set({ status: "HEALTHY", cooldownUntil: null, failureReason: null }).where(eq(projectApiKeys.id, key.id));
      }

      if (status === "HEALTHY") {
        const decrypted = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
        if (decrypted) {
          widgetKeys.push({
            id: key.id,
            type: 'project',
            provider: key.provider,
            model: key.model || undefined,
            decryptedKey: decrypted,
            rawDbKey: key
          });
        }
      }
    }
  } catch (err) {
    console.error("Widget public router: failed to load project keys:", err);
  }

  try {
    // 2. User Keys (Project Owner)
    if (userId) {
      const userKeysList = await db.query.userApiKeys.findMany({
        where: and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true))
      });

      for (const key of userKeysList) {
        let status = key.status;
        if ((status === "COOLDOWN" || status === "QUOTA_EXCEEDED" || status === "UNHEALTHY") && key.cooldownUntil && now > key.cooldownUntil) {
          status = "HEALTHY";
          await db.update(userApiKeys).set({ status: "HEALTHY", cooldownUntil: null, failureReason: null }).where(eq(userApiKeys.id, key.id));
        }

        if (status === "HEALTHY") {
          const decrypted = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
          if (decrypted) {
            widgetKeys.push({
              id: key.id,
              type: 'user',
              provider: key.provider,
              decryptedKey: decrypted,
              rawDbKey: key
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Widget public router: failed to load user keys:", err);
  }

  try {
    // 3. System Keys
    const systemKeysList = await db.query.userApiKeys.findMany({
      where: and(isNull(userApiKeys.userId), eq(userApiKeys.isEnabled, true))
    });

    for (const key of systemKeysList) {
      let status = key.status;
      if ((status === "COOLDOWN" || status === "QUOTA_EXCEEDED" || status === "UNHEALTHY") && key.cooldownUntil && now > key.cooldownUntil) {
        status = "HEALTHY";
        await db.update(userApiKeys).set({ status: "HEALTHY", cooldownUntil: null, failureReason: null }).where(eq(userApiKeys.id, key.id));
      }

      if (status === "HEALTHY") {
        const decrypted = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
        if (decrypted) {
          widgetKeys.push({
            id: key.id,
            type: 'system',
            provider: key.provider,
            decryptedKey: decrypted,
            rawDbKey: key
          });
        }
      }
    }
  } catch (err) {
    console.error("Widget public router: failed to load system keys:", err);
  }

  // 4. Env fallback keys
  const envKeys = Array.from(new Set([
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY
  ].filter(Boolean) as string[]));

  envKeys.forEach((envKey) => {
    widgetKeys.push({
      type: 'env',
      provider: 'gemini',
      decryptedKey: envKey
    });
  });

  // Sort: Project Keys (primary first) -> User Keys -> System Keys -> Env Keys
  return widgetKeys.sort((a, b) => {
    const priority = { project: 1, user: 2, system: 3, env: 4 };
    if (priority[a.type] !== priority[b.type]) {
      return priority[a.type] - priority[b.type];
    }
    if (a.type === 'project' && b.type === 'project') {
      const ap = a.rawDbKey?.isPrimary ? 1 : 0;
      const bp = b.rawDbKey?.isPrimary ? 1 : 0;
      return bp - ap;
    }
    return 0;
  });
}

async function updateKeySuccessWidget(key: WidgetKey) {
  if (key.type === 'env') return;
  const now = new Date();
  
  try {
    if (key.type === 'project') {
      await db.update(projectApiKeys).set({
        lastSuccess: now,
        status: "HEALTHY",
        failureReason: null
      }).where(eq(projectApiKeys.id, key.id!));
    } else {
      const newUsed = (key.rawDbKey?.dailyUsed || 0) + 1;
      let status = "HEALTHY";
      if (key.rawDbKey?.dailyLimit !== null && newUsed >= (key.rawDbKey?.dailyLimit || 20)) {
        status = "QUOTA_EXCEEDED";
      }
      await db.update(userApiKeys).set({
        dailyUsed: newUsed,
        lastSuccess: now,
        totalRequests: (key.rawDbKey?.totalRequests || 0) + 1,
        status,
        failureReason: null
      }).where(eq(userApiKeys.id, key.id!));
    }
  } catch (err) {
    console.error("Failed to update widget key success stats:", err);
  }
}

async function updateKeyFailureWidget(key: WidgetKey, error: any) {
  if (key.type === 'env') return;
  const now = new Date();
  
  const statusStr = error?.status || error?.response?.status || error?.code || 'unknown';
  const errMessage = error?.message || String(error);
  
  let cooldownMinutes = 0;
  let status = "COOLDOWN";
  
  if (statusStr === '403' || statusStr === 403 || errMessage.includes('403')) {
    status = "INVALID";
  } else if (statusStr === '429' || statusStr === 429 || errMessage.includes('429')) {
    status = "QUOTA_EXCEEDED";
    cooldownMinutes = 15;
  } else if (errMessage.toLowerCase().includes('timeout')) {
    cooldownMinutes = 2;
  } else {
    status = "UNHEALTHY";
    cooldownMinutes = 5;
  }

  const cooldownUntil = cooldownMinutes > 0 ? new Date(now.getTime() + cooldownMinutes * 60000) : null;

  try {
    if (key.type === 'project') {
      await db.update(projectApiKeys).set({
        status,
        cooldownUntil,
        failureReason: errMessage,
        lastFailure: now,
      }).where(eq(projectApiKeys.id, key.id!));
    } else {
      await db.update(userApiKeys).set({
        status,
        cooldownUntil,
        failureReason: errMessage,
        lastFailure: now,
        totalFailures: (key.rawDbKey?.totalFailures || 0) + 1,
        totalRequests: (key.rawDbKey?.totalRequests || 0) + 1,
      }).where(eq(userApiKeys.id, key.id!));
    }
  } catch (err) {
    console.error("Failed to update widget key failure stats:", err);
  }
}

async function executeKeyRequest(key: WidgetKey, method: 'generateContent' | 'generateContentStream', options: any): Promise<any> {
  if (key.provider !== 'gemini') {
    const adapter = new UniversalProviderAdapter({
      provider: key.provider,
      apiKey: key.decryptedKey,
      model: options.model || key.model || "gpt-4o"
    });
    
    let messages: any[] = [];
    if (options.contents && Array.isArray(options.contents)) {
      messages = options.contents.map((c: any) => ({
        role: c.role === 'model' ? 'assistant' as const : 'user' as const,
        content: c.parts?.[0]?.text || ""
      }));
    } else if (typeof options.contents === 'string') {
      messages = [{ role: 'user' as const, content: options.contents }];
    }

    const response = await adapter.generateChat({
      messages,
      temperature: 0.7
    });

    if (method === 'generateContent') {
      return { text: response.content };
    } else {
      return [{ text: response.content }];
    }
  } else {
    return await executeWithFallback(key.decryptedKey, method, options);
  }
}

async function executeLlmWithFailover(
  keys: WidgetKey[], 
  method: 'generateContent' | 'generateContentStream', 
  options: any
): Promise<{ result: any; keyUsed: WidgetKey }> {
  let lastError: any = null;
  
  for (const key of keys) {
    try {
      const attemptOptions = { ...options };
      if (key.model && !attemptOptions.model) {
        attemptOptions.model = key.model;
      }
      
      console.log(`[Widget API Failover] Trying key: ${key.id || 'env'} (${key.type}) | Provider: ${key.provider} | Model: ${attemptOptions.model || 'default'}`);
      
      const result = await executeKeyRequest(key, method, attemptOptions);
      
      updateKeySuccessWidget(key).catch(e => console.error("Key success update error:", e));
      return { result, keyUsed: key };
    } catch (err: any) {
      lastError = err;
      console.error(`[Widget API Failover] Key failed: ${key.id || 'env'} (${key.type}). Error: ${err.message || err}`);
      
      updateKeyFailureWidget(key, err).catch(e => console.error("Key failure update error:", e));
    }
  }
  
  throw lastError || new Error("No healthy API keys available to execute the request");
}

const router = Router();

// Middleware to validate origin for widget routes
router.use(async (req: Request, res: Response, next): Promise<any> => {
  // Extract token from URL path robustly, ignoring any empty segments caused by double slashes
  const pathSegments = req.path.split('/').filter(Boolean);
  const pathToken = pathSegments[0]; 
  const widgetToken = req.params?.widgetToken || req.body?.widgetToken || req.query?.widgetToken || pathToken;
  
  if (!widgetToken) {
    return res.status(401).json({ error: "Missing widget token" });
  }

  try {
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.widgetToken, widgetToken as string)
    });

    if (!settings || !settings.isEnabled) {
      return res.status(403).json({ error: "Invalid or disabled widget token" });
    }

    const origin = req.headers.origin;
    if (origin && origin !== "null" && settings.allowedDomains.length > 0) {
      const allowedUrls = settings.allowedDomains.map((domain: string) => {
        try {
          return new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname;
        } catch {
          return domain;
        }
      });
      
      try {
        const requestHostname = new URL(origin).hostname;
        if (!allowedUrls.includes(requestHostname)) {
          return res.status(403).json({ error: "Domain not authorized" });
        }
      } catch (e) {
        return res.status(403).json({ error: "Invalid origin" });
      }
    }

    // Pass projectId to request
    (req as any).projectId = settings.projectId;
    return next();
  } catch (error) {
    console.error("Widget validation error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:widgetToken/config", async (req: Request, res: Response): Promise<any> => {
  try {
    // Prevent caching of the configuration so CSS/theme updates reflect instantly in production
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const projectId = (req as any).projectId;
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    const contextSettings = await db.query.projectContextSettings.findFirst({
      where: eq(projectContextSettings.projectId, projectId)
    });

    if (!settings) {
      return res.status(404).json({ error: "Widget config not found" });
    }

    // Return safe configuration (no keys, no internal ids if possible)
    return res.json({
      botName: settings.botName,
      botAvatar: settings.botAvatar,
      welcomeMessage: settings.welcomeMessage,
      themeColor: settings.themeColor,
      position: settings.position,
      displayMode: settings.displayMode,
      customCss: settings.customCss,
      customContainerId: settings.customContainerId,
      humanHandoffLinks: settings.humanHandoffLinks,
      leadsEnabled: settings.leadsEnabled,
      contextEngine: contextSettings ? {
        enabled: contextSettings.enabled,
        maxContextSizeBytes: contextSettings.maxContextSizeBytes,
        developerDebugMode: contextSettings.developerDebugMode
      } : { enabled: false }
    });
  } catch (error) {
    console.error("Failed to fetch widget config", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:widgetToken/chat", async (req: Request, res: Response): Promise<any> => {
  const { messages, websiteContext, sessionId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages format" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const projectId = (req as any).projectId;

    // Get project details to know the owner's userId for key failover/rotation
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    const userId = project ? project.userId : null;

    // Track Analytics
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const estimatedTokens = Math.floor(JSON.stringify(messages).length / 4);

      const existingAnalytics = await db.query.widgetAnalytics.findFirst({
        where: and(
          eq(widgetAnalytics.projectId, projectId),
          eq(widgetAnalytics.date, today)
        )
      });

      if (existingAnalytics) {
        await db.update(widgetAnalytics)
          .set({
            messages: existingAnalytics.messages + 1,
            conversations: messages.length <= 2 ? existingAnalytics.conversations + 1 : existingAnalytics.conversations,
            tokenUsage: existingAnalytics.tokenUsage + estimatedTokens,
            uniqueVisitors: messages.length <= 2 ? existingAnalytics.uniqueVisitors + 1 : existingAnalytics.uniqueVisitors
          })
          .where(eq(widgetAnalytics.id, existingAnalytics.id));
      } else {
        await db.insert(widgetAnalytics).values({
          projectId,
          date: today,
          messages: 1,
          conversations: 1,
          tokenUsage: estimatedTokens,
          uniqueVisitors: 1,
          aiCosts: "0"
        } as any);
      }
    } catch (e) {
      console.error("Failed to track analytics:", e);
    }

    // Resolve & Manage Keys with Failover
    const keys = await fetchAndManageWidgetKeys(projectId, userId);

    if (keys.length === 0) {
      res.write(`data: ${JSON.stringify({ content: "Sorry, no AI API keys are configured for this chatbot. Please configure an API key in your dashboard." })}\n\n`);
      res.end();
      return res;
    }

    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const previousAssistantMessage = messages.length >= 2 ? messages[messages.length - 2]?.content : "";

    // 1. Check if the user is pointing out a mistake
    let userIsPointingOutMistake = false;
    const isCorrectionTriggerWord = lastUserMessage.match(/\b(wrong|mistake|incorrect|false|error|fix|correct|not right|bullshit|fake)\b/i);
    
    if (isCorrectionTriggerWord && messages.length >= 3) {
      try {
        const confirmPrompt = `Analyze the user's message and determine if they are indicating that the assistant made a mistake, gave a wrong or incorrect answer in the previous turn, or is correcting/updating the assistant's facts.
        
        User Message: "${lastUserMessage}"
        
        Respond with only "YES" or "NO".`;
        
        const { result: confirmRes } = await executeLlmWithFailover(keys, 'generateContent', {
          model: "gemini-2.5-flash",
          contents: confirmPrompt
        });
        
        if (confirmRes.text?.trim().toUpperCase() === "YES") {
          userIsPointingOutMistake = true;
        }
      } catch (err) {
        console.error("Error confirming correction:", err);
      }
    }

    // 2. Correction flow using Google Search
    if (userIsPointingOutMistake) {
      res.write(`data: ${JSON.stringify({ content: "🔍 *Checking Google Search to verify and correct my answer...*\n\n" })}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      const verifyPrompt = `The user claims the assistant's previous answer was wrong or incomplete.
      Previous Assistant Answer: "${previousAssistantMessage}"
      User Message: "${lastUserMessage}"
      
      Perform a Google search to verify the facts and find the correct, up-to-date answer. Summarize the verified facts clearly.`;

      let verifiedText = "";
      try {
        const { result: searchRes } = await executeLlmWithFailover(keys, 'generateContent', {
          model: "gemini-2.5-flash",
          contents: verifyPrompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        verifiedText = searchRes.text || "";

        // Save new verified fact to project knowledge base
        const correctionContent = `Corrected Fact (based on user feedback and Google search verification):
        Topic/Context: User stated "${lastUserMessage}" in response to previous answer "${previousAssistantMessage}".
        Verified Correct Information: ${verifiedText}
        Updated on: ${new Date().toISOString()}`;

        await saveAutoKnowledgeItem({
          projectId,
          userId,
          content: correctionContent
        });

        // Stream explanation & answer
        const systemPrompt = `You are a helpful customer support chatbot. The user just corrected your previous answer, and you verified the correct info using Google Search.
        
        Verified Information from Google:
        ${verifiedText}
        
        ${project?.systemPrompt ? `CRITICAL PROJECT RULES YOU MUST STRICTLY FOLLOW:\n${project.systemPrompt}\n\n` : ''}Explain the correction politely, state that you've updated your knowledge base so you won't make this mistake again, and answer their question based on the verified information.`;

        const { result: stream } = await executeLlmWithFailover(keys, 'generateContentStream', {
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }]
        });

        for await (const chunk of stream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
          }
        }
      } catch (err) {
        console.error("Error in correction flow:", err);
        res.write(`data: ${JSON.stringify({ content: "Sorry, I encountered an error while verifying the information on Google." })}\n\n`);
      }
      res.end();
      return res;
    }

    // 3. Normal flow with Context Engine & Knowledge Base retrieval
    let contextSettings = await db.query.projectContextSettings.findFirst({
      where: eq(projectContextSettings.projectId, projectId)
    });
    
    // Default settings if not configured
    if (!contextSettings) {
      contextSettings = {
        enabled: false,
        dashboardAnalysis: true,
        formAssistant: true,
        tableAnalysis: true,
        navigationAssistant: true,
        knowledgeComparison: true,
        mistakeDetection: true,
        contextMemory: true,
        developerDebugMode: false,
        maxContextSizeBytes: 6144
      } as any;
    }

    let finalWebsiteContext = null;
    let sessionMemory = null;

    if (contextSettings.enabled && websiteContext && sessionId) {
      const validated = validateWebsiteContext(websiteContext, contextSettings.maxContextSizeBytes);
      if (validated) {
        finalWebsiteContext = deltaReconstructor.reconstruct(sessionId, validated);
        if (finalWebsiteContext && contextSettings.contextMemory) {
          sessionMemory = sessionMemoryStore.update(sessionId, finalWebsiteContext);
        }
      }
    }

    // Fuse context & KB
    const fusedContext = await contextFuser.fuse({
      userMessage: lastUserMessage,
      websiteContext: finalWebsiteContext,
      projectId,
      userId,
      settings: contextSettings as any
    });

    let handoffInfo = "";
    try {
      const widgetSettings = await db.query.projectWidgetSettings.findFirst({
        where: eq(projectWidgetSettings.projectId, projectId)
      });
      if (widgetSettings?.humanHandoffLinks) {
        const links = widgetSettings.humanHandoffLinks as Record<string, string>;
        const details = [];
        if (links.whatsapp) details.push(`WhatsApp: ${links.whatsapp}`);
        if (links.phone) details.push(`Phone Number: ${links.phone}`);
        if (links.email) details.push(`Email Address: ${links.email}`);
        if (links.telegram) details.push(`Telegram: ${links.telegram}`);
        
        if (details.length > 0) {
          handoffInfo = `\n\nCONTACT DETAILS (HUMAN HANDOFF):\nIf the user asks to speak to a human, contact support, or asks for contact details (like phone number, email, or whatsapp), you MUST provide these exact details directly to them:\n${details.join("\n")}\n`;
        }
      }
    } catch (err) {
      console.error("Error fetching widget settings for handoff:", err);
    }

    const systemPrompt = buildContextAwarePrompt({
      project,
      fusedContext,
      sessionMemory,
      settings: contextSettings as any,
      handoffInfo
    });

    const chatMessages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as a helpful customer support chatbot using the provided knowledge base context." }] },
      ...messages.map(m => ({
        role: (m.role === "assistant" ? "model" : "user"),
        parts: [{ text: m.content }]
      }))
    ];

    try {
      const { result: stream } = await executeLlmWithFailover(keys, 'generateContentStream', {
        contents: chatMessages as any
      });
      
      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        }
      }
    } catch (err) {
      console.error("Error generating normal stream response:", err);
      res.write(`data: ${JSON.stringify({ content: "Sorry, I am having trouble connecting right now." })}\n\n`);
    }
    res.end();
    return res;

  } catch (error: any) {
    console.error("Widget chat general error:", error);
    res.write(`data: ${JSON.stringify({ content: "Internal server error occurred." })}\n\n`);
    res.end();
    return res;
  }
});

export default router;
