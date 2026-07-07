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

function isRetryableLlmError(err: any): boolean {
  if (!err) return false;
  const status = err?.status || err?.response?.status || err?.code;
  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500 || status === 408) {
    return true;
  }
  const statusStr = String(err?.status || err?.response?.status || err?.code || "").toUpperCase();
  if (statusStr === "UNAVAILABLE" || statusStr === "RESOURCE_EXHAUSTED" || statusStr === "INTERNAL") {
    return true;
  }
  const errMessage = String(err?.message || err?.stack || err).toLowerCase();
  
  // Fast-fail if the quota limit is explicitly 0 (model not available on this tier)
  if (errMessage.includes("limit: 0")) {
    return false;
  }
  const retryableKeywords = [
    "429", "503", "500", "502", "504",
    "unavailable", "resource_exhausted", "quota", "timeout", "deadline exceeded",
    "rate limit", "overloaded", "too many requests", "service unavailable", "internal server error",
    "spikes in demand", "experiencing high demand", "try again later"
  ];
  return retryableKeywords.some(keyword => errMessage.includes(keyword));
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isRetryable = isRetryableLlmError(err);
      if (isRetryable && attempt <= maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[LLM Retry] Attempt ${attempt} failed with retryable error: ${err.message || err}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

async function executeWithFallback(activeKey: string, method: 'generateContent' | 'generateContentStream', options: any): Promise<any> {
  const httpOptions: any = {};
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    httpOptions.baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  }
  
  const directClient = new GoogleGenAI({
    apiKey: activeKey,
    ...(Object.keys(httpOptions).length > 0 ? { httpOptions } : {})
  });
  
  const FALLBACK_MODELS = [
    "gemini-2.0-flash-lite", 
    "gemini-1.5-pro", 
    "gemini-1.5-flash-002", 
    "gemini-1.5-flash-8b"
  ];
  let requestedModel = options.model || "gemini-2.0-flash";
  const modelsToTry = Array.from(new Set([requestedModel, ...FALLBACK_MODELS]));
  
  for (let i = 0; i < modelsToTry.length; i++) {
    const attemptModel = modelsToTry[i];
    const isLast = i === modelsToTry.length - 1;
    try {
      const attemptOptions = { ...options, model: attemptModel };
      console.log("--- GEMINI INVOCATION DIAGNOSTICS ---");
      console.log("Model:", attemptModel);
      console.log("Contents array size:", attemptOptions.contents?.length || 0);
      console.log("Config keys:", attemptOptions.config ? Object.keys(attemptOptions.config) : 'none');
      console.log("Full request payload:", JSON.stringify(attemptOptions, null, 2).substring(0, 500) + '...');
      
      if (method === 'generateContent') {
        return await executeWithRetry(() => directClient.models.generateContent(attemptOptions));
      } else {
        return await executeWithRetry(() => directClient.models.generateContentStream(attemptOptions));
      }
    } catch (err: any) {
      const isRetryable = isRetryableLlmError(err);
      if (isRetryable && !isLast) {
        console.warn(`Widget API error on model ${attemptModel}, falling back to next model...`);
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
  let projectKeysList: any[] = [];
  let userKeysList: any[] = [];
  let systemKeysList: any[] = [];

  try {
    // 1. Project Keys
    projectKeysList = await db.query.projectApiKeys.findMany({
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
      userKeysList = await db.query.userApiKeys.findMany({
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
    systemKeysList = await db.query.userApiKeys.findMany({
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

  // Fallback: If no fully HEALTHY keys are available in the database, fall back to trying all enabled keys
  // that are not explicitly marked as INVALID (meaning cooldown/quota status but still enabled).
  // This matches the self-healing behavior in integrations-gemini-ai/src/client.ts.
  if (widgetKeys.length === 0) {
    console.warn("[Widget Routing] No HEALTHY keys available. Falling back to trying all enabled keys in cooldown/quota status.");
    
    // Project keys fallback
    for (const key of projectKeysList) {
      if (key.isEnabled && key.status !== "INVALID") {
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
    
    // User keys fallback
    if (userId) {
      for (const key of userKeysList) {
        if (key.isEnabled && key.status !== "INVALID") {
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
    
    // System keys fallback
    for (const key of systemKeysList) {
      if (key.isEnabled && key.status !== "INVALID") {
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

function checkIsDailyLimit(error: any): boolean {
  if (!error) return false;
  const parts: string[] = [];
  if (error.message) parts.push(String(error.message));
  if (error.stack) parts.push(String(error.stack));
  if (typeof error === 'string') parts.push(error);
  try {
    if (error.response) {
      parts.push(typeof error.response === 'string' ? error.response : JSON.stringify(error.response));
    }
    if (error.details) {
      parts.push(typeof error.details === 'string' ? error.details : JSON.stringify(error.details));
    }
    parts.push(JSON.stringify(error));
  } catch (e) {}
  
  const fullErrorText = parts.join(" ").toLowerCase();
  const hasQuotaExceeded = fullErrorText.includes("quota exceeded") || fullErrorText.includes("quota_exceeded") || fullErrorText.includes("exceeded your current quota");
  const isDailyOrFreeLimit = 
    fullErrorText.includes("generaterequestsperday") || 
    fullErrorText.includes("requestsperday") || 
    fullErrorText.includes("daily") || 
    (fullErrorText.includes("free_tier") && fullErrorText.includes("limit: 0")) ||
    (fullErrorText.includes("free-tier") && fullErrorText.includes("limit: 0")) ||
    fullErrorText.includes("check your plan and billing details");
    
  return hasQuotaExceeded && isDailyOrFreeLimit;
}

function calculateCooldown(error: any): number {
  if (checkIsDailyLimit(error)) {
    return 720; // 12 hours
  }
  
  const errText = String(error?.message || error).toLowerCase();
  
  // Try to parse retry delay from error message (e.g. "Please retry in 57.061310034s.")
  const match = errText.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    return Math.max(1, Math.ceil(seconds / 60));
  }
  
  // Check retry-after header if present (commonly returned by proxies/gateways)
  const retryAfterHeader = error?.response?.headers?.get?.('retry-after');
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      // Cap RPM rate limit cooldown at 2 minutes to prevent starving the key rotation pool
      return Math.min(2, Math.max(1, Math.ceil(seconds / 60)));
    }
  }
  
  return 1; // default 1 minute for other 429 rate limits
}

async function updateKeyFailureWidget(key: WidgetKey, error: any) {
  if (key.type === 'env') return;
  const now = new Date();
  
  const statusStr = error?.status || error?.response?.status || error?.code || 'unknown';
  const errMessage = error?.message || String(error);
  const errStr = errMessage.toLowerCase();
  
  let cooldownMinutes = 0;
  let status = "COOLDOWN";
  let isEnabled = true;
  
  const is403 = statusStr === '403' || statusStr === 403 || errStr.includes('403') || errStr.includes('permission denied') || errStr.includes('api key not valid');
  const isTimeout = errStr.includes('timeout') || errStr.includes('deadline exceeded');
  const is429 = statusStr === '429' || statusStr === 429 || errStr.includes('429') || errStr.includes('too many requests') || errStr.includes('resource_exhausted') || errStr.includes('quota');
  
  if (is403) {
    status = "INVALID";
    cooldownMinutes = 0;
    isEnabled = false;
  } else if (is429) {
    status = "QUOTA_EXCEEDED";
    cooldownMinutes = calculateCooldown(error);
  } else if (isTimeout) {
    status = "COOLDOWN";
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
        isEnabled: isEnabled ? undefined : false
      }).where(eq(projectApiKeys.id, key.id!));
    } else {
      await db.update(userApiKeys).set({
        status,
        cooldownUntil,
        failureReason: errMessage,
        lastFailure: now,
        totalFailures: (key.rawDbKey?.totalFailures || 0) + 1,
        totalRequests: (key.rawDbKey?.totalRequests || 0) + 1,
        isEnabled: isEnabled ? undefined : false
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
      const resVal = { text: response.content };
      console.log("LOG: executeKeyRequest (UniversalProviderAdapter) returning (generateContent):", JSON.stringify(resVal).substring(0, 500));
      return resVal;
    } else {
      const resVal = [{ text: response.content }];
      console.log("LOG: executeKeyRequest (UniversalProviderAdapter) returning (stream):", JSON.stringify(resVal).substring(0, 500));
      return resVal;
    }
  } else {
    console.log("LOG: executeKeyRequest delegating to executeWithFallback (Gemini native)");
    const resVal = await executeWithFallback(key.decryptedKey, method, options);
    console.log("LOG: executeKeyRequest (executeWithFallback) returned");
    return resVal;
  }
}

async function executeLlmWithFailover(
  keys: WidgetKey[], 
  method: 'generateContent' | 'generateContentStream', 
  options: any
): Promise<{ result: any; keyUsed: WidgetKey }> {
  console.log("ENTER executeLlmWithFailover");
  let lastError: any = null;
  
  for (const key of keys) {
    try {
      const attemptOptions = { ...options };
      if (key.model && !attemptOptions.model) {
        attemptOptions.model = key.model;
      }
      
      console.log("STEP 10: Inside executeLlmWithFailover()");
      console.log("  - selected provider:", key.provider);
      console.log("  - selected model:", attemptOptions.model || 'default');
      console.log("  - api key exists:", !!key.decryptedKey);
      console.log("  - request payload keys:", Object.keys(attemptOptions));
      console.log("  - request size bytes:", JSON.stringify(attemptOptions).length);
      
      const result = await executeKeyRequest(key, method, attemptOptions);
      
      updateKeySuccessWidget(key).catch(e => console.error("Key success update error:", e));
      console.log("LOG: executeLlmWithFailover returning success from key:", key.provider);
      return { result, keyUsed: key };
    } catch (err: any) {
      lastError = err;
      console.error(`[Widget API Failover] Key failed: ${key.id || 'env'} (${key.type}). Error: ${err.message || err}`);
      
      const status = err?.status || err?.response?.status || err?.code;
      const isTransient = status === 503 || status === 502 || status === 504 || status === 500 ||
                          err?.message?.includes("503") || err?.message?.includes("502") || 
                          err?.message?.includes("504") || err?.message?.includes("500") ||
                          err?.message?.toLowerCase().includes("timeout") ||
                          err?.message?.toLowerCase().includes("unavailable");
                          
      if (isTransient) {
        console.warn(`[Widget API Failover] Skipping database unhealthy lock for key ${key.id || 'env'} because the failure was transient server-side load/outage.`);
      } else {
        updateKeyFailureWidget(key, err).catch(e => console.error("Key failure update error:", e));
      }
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
          console.error("EARLY RETURN: Domain not authorized", origin);
          return res.status(403).json({ error: "Domain not authorized" });
        }
      } catch (e) {
        console.error("EARLY RETURN: Invalid origin", origin);
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
      } : { enabled: true, maxContextSizeBytes: 6144, developerDebugMode: false }
    });
  } catch (error) {
    console.error("Failed to fetch widget config", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:widgetToken/chat", async (req: Request, res: Response): Promise<any> => {
  const { messages, websiteContext, sessionId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    console.error("EARLY RETURN: Invalid messages format", req.body);
    return res.status(400).json({ error: "Invalid messages format" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const projectId = (req as any).projectId;
    console.log("\n=============================================");
    console.log("STEP 1: Incoming request body:", JSON.stringify(req.body).substring(0, 500));
    console.log("STEP 2: Resolved widget token:", req.params.widgetToken);
    console.log("STEP 3: Resolved project id:", projectId);

    // Get project details to know the owner's userId for key failover/rotation
    let project;
    try {
      project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      console.log("STEP 4: Loaded project:", project?.id);
    } catch (err: any) {
      console.error("Failed Loading project...", err.stack || err);
      throw err;
    }
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
      console.error("EARLY RETURN: No AI API keys configured");
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
          model: "gemini-2.0-flash",
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
          model: "gemini-2.0-flash",
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
          model: "gemini-2.0-flash",
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
    let contextSettings;
    try {
      contextSettings = await db.query.projectContextSettings.findFirst({
        where: eq(projectContextSettings.projectId, projectId)
      });
      console.log("Loaded context settings:", contextSettings ? "Found" : "Missing");
    } catch (err: any) {
      console.error("Failed Loading context settings...", err.stack || err);
      throw err;
    }
    
    // Default settings if not configured
    if (!contextSettings) {
      contextSettings = {
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
      } as any;
    }

    let finalWebsiteContext = null;
    let sessionMemory = null;

    try {
      if (contextSettings.enabled && websiteContext && sessionId) {
        // Reconstruct first (handles delta merging and validates the final full context internally)
        finalWebsiteContext = deltaReconstructor.reconstruct(sessionId, websiteContext);
        if (finalWebsiteContext && contextSettings.contextMemory) {
          sessionMemory = sessionMemoryStore.update(sessionId, finalWebsiteContext);
        }
      }
    } catch (err: any) {
      console.error("Failed processing website context...", err.stack || err);
      throw err;
    }

    // Fuse context & KB
    let fusedContext;
    try {
      fusedContext = await contextFuser.fuse({
        userMessage: lastUserMessage,
        websiteContext: finalWebsiteContext,
        projectId,
        userId,
        settings: contextSettings as any,
        apiKeys: keys
      });
    } catch (err: any) {
      console.error("Failed contextFuser() step...", err.stack || err);
      throw err;
    }

    let handoffInfo = "";
    try {
      const widgetSettings = await db.query.projectWidgetSettings.findFirst({
        where: eq(projectWidgetSettings.projectId, projectId)
      });
      console.log("STEP 5: Loaded widget settings:", widgetSettings ? "Found" : "Missing");
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

    let systemPrompt;
    try {
      systemPrompt = buildContextAwarePrompt({
        project: project as any,
        fusedContext,
        sessionMemory,
        settings: contextSettings as any,
        handoffInfo
      });

    } catch (err: any) {
      console.error("Failed buildContextAwarePrompt()...", err.stack || err);
      throw err;
    }

    const chatMessages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as a helpful customer support chatbot using the provided knowledge base context." }] },
      ...messages.map(m => ({
        role: (m.role === "assistant" ? "model" : "user"),
        parts: [{ text: m.content }]
      }))
    ];

    // INTENT DETECTION
    let intentType = "GENERAL_QUESTION";
    try {
      const intentPrompt = `Classify the user's intent based on their latest message: "${lastUserMessage}".
      
      Categories:
      - ACTION_REQUEST: The user is explicitly asking you to DO something on the website (e.g., "Create a client", "Click the Add button", "Fill the form", "Navigate to dashboard", "Delete the invoice", "Update my profile").
      - KNOWLEDGE_QUESTION: The user is asking for information, facts, or help that requires an explanation (e.g., "How do I create a client?", "What is your refund policy?").
      - GENERAL_QUESTION: Conversational chat or generic questions.
      
      Output ONLY a JSON object with the format: {"intent": "CATEGORY_NAME"}`;

      const { result: intentRes } = await executeLlmWithFailover(keys, 'generateContent', {
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: intentPrompt }] }],
        config: { responseMimeType: "application/json" }
      });
      
      try {
        const parsed = JSON.parse(intentRes.text || "{}");
        if (parsed.intent) {
          intentType = parsed.intent;
        }
      } catch (e) {
        console.error("Failed to parse intent JSON", e);
      }
    } catch (e) {
      console.error("Intent detection failed, defaulting to GENERAL_QUESTION", e);
    }
    
    console.log(`[WIDGET ROUTING] Detected Intent: ${intentType}`);

    try {
      // If the intent is an ACTION_REQUEST, bypass the conversational LLM and route directly to the Coordinator
      if (intentType === "ACTION_REQUEST") {
        
        // Let the user know we are processing the action immediately
        res.write(`data: ${JSON.stringify({ content: "⚙️ *Executing action...*\n\n" })}\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();

        const { CoordinatorAgent } = require("../agents/coordinator");
        const coordinator = new CoordinatorAgent();
        const actionRes = await coordinator.execute({
           projectId,
           sessionId,
           payload: { intent: lastUserMessage, context: finalWebsiteContext }
        });
        
        if (actionRes.success && actionRes.data?.action && actionRes.data.action.type !== 'idle') {
           const payload = { 
              action: actionRes.data.action,
              executionId: actionRes.data.executionId,
              security: actionRes.data.security
           };
           res.write(`data: ${JSON.stringify(payload)}\n\n`);
           if (typeof (res as any).flush === 'function') (res as any).flush();
        } else if (!actionRes.success) {
           res.write(`data: ${JSON.stringify({ content: `\n❌ *Failed to execute action:* ${actionRes.error}` })}\n\n`);
        }
        
        res.end();
        return res;
      }

      // OTHERWISE, normal conversational flow
      const { result: stream } = await executeLlmWithFailover(keys, 'generateContentStream', {
        contents: chatMessages as any
      });
      
      let fullResponseText = "";
      for await (const chunk of stream) {
        if (chunk.text) {
          fullResponseText += chunk.text;
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        }
      }

      // After streaming chat, invoke Swarm Coordinator ONLY IF they explicitly asked for an action in a roundabout way
      // But usually, ACTION_REQUEST handles this now. We'll leave a soft-invoke here just in case the LLM realizes it needs to act.
      try {
        const { CoordinatorAgent } = require("../agents/coordinator");
        const coordinator = new CoordinatorAgent();
        const actionRes = await coordinator.execute({
           projectId,
           sessionId,
           payload: { intent: lastUserMessage, context: finalWebsiteContext }
        });
        
        if (actionRes.success && actionRes.data?.action && actionRes.data.action.type !== 'idle') {
           const payload = { 
              action: actionRes.data.action,
              executionId: actionRes.data.executionId,
              security: actionRes.data.security
           };
           res.write(`data: ${JSON.stringify(payload)}\n\n`);
           if (typeof (res as any).flush === 'function') (res as any).flush();
        }
      } catch(e) {
         console.error("Coordinator error during stream fallback:", e);
      }
    } catch (err: any) {
      console.error("executeLlmWithFailover threw an error:", err);
      res.write(`data: ${JSON.stringify({ content: "I'm sorry, I'm having trouble connecting to my backend systems right now. Please try again later." })}\n\n`);
      res.end();
      return res;
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

// Milestone 2: Swarm Dry-run execution
import { CoordinatorAgent } from "../agents/coordinator";

router.post("/:widgetToken/swarm-dryrun", async (req: Request, res: Response): Promise<any> => {
  const { intent, context, sessionId } = req.body;
  if (!intent || !sessionId) {
    return res.status(400).json({ error: "Missing intent or sessionId" });
  }

  try {
    const projectId = (req as any).projectId;
    const coordinator = new CoordinatorAgent();

    const result = await coordinator.execute({
      projectId,
      sessionId,
      payload: {
        intent,
        context
      }
    });

    if (result.success) {
      return res.json(result.data);
    } else {
      return res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error("Swarm dryrun error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Action Engine Result Webhook
import { workflowExecutions, executionSteps } from "@workspace/db/schema";

router.post("/:widgetToken/action-result", async (req: Request, res: Response): Promise<any> => {
  const { executionId, actionId, status, tool, duration, url, domDelta, verification, error } = req.body;
  if (!executionId || !actionId) {
    return res.status(400).json({ error: "Missing executionId or actionId" });
  }

  try {
    const projectId = (req as any).projectId;
    
    // Update execution steps
    await db.update(executionSteps)
      .set({ 
        status, 
        verificationResult: verification || {}, 
        error 
      })
      .where(eq(executionSteps.id, actionId));

    // Wake up CoordinatorAgent to continue plan
    const [execRecord] = await db.select().from(workflowExecutions).where(eq(workflowExecutions.id, executionId));
    if (execRecord) {
       setTimeout(() => {
          const coordinator = new CoordinatorAgent();
          coordinator.execute({
            projectId,
            sessionId: execRecord.sessionId,
            payload: { resumeExecution: true, executionId, actionResult: req.body }
          }).catch(console.error);
       }, 0);
    }
    
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Action result error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
