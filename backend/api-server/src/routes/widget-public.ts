import { submitMessageFeedback, submitProjectFeedback } from '../services/feedback';
import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { db, crypto } from "@workspace/db";
import { projectWidgetSettings, projects, knowledgeSources, knowledgeChunks, projectApiKeys, userApiKeys, widgetAnalytics, apiLogs, widgetLeads, chatSessions, customers, workflowExecutions, executionSteps } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { UniversalProviderAdapter } from "../services/llm-provider";
import { minuteCache, llmResponseCache } from "../services/cache-provider";
import nodeCrypto from "crypto";
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
import { detectPromptInjection } from "../middlewares/prompt-firewall";
import {
  validateWidgetOrigin,
  checkProjectEntitlement,
  redactSensitiveContext,
  sendSafeError,
  getRequestId,
  checkAndIncrementUsage,
  verifyActionConfirmationToken,
} from "../security";
import { processAndSaveLead } from "../services/lead-detection";
import { trackUserQuestion } from "../services/question-normalization";
import { trackKnowledgeGap, isFallbackResponse } from "../services/unanswered-questions";


function isRetryableLlmError(err: any): boolean {
  if (!err) return false;
  const status = err?.status || err?.response?.status || err?.code;
  if (status === 503 || status === 502 || status === 504 || status === 500 || status === 408) {
    return true;
  }
  const statusStr = String(err?.status || err?.response?.status || err?.code || "").toUpperCase();
  if (statusStr === "INTERNAL") {
    return true;
  }
  const errMessage = String(err?.message || err?.stack || err).toLowerCase();
  
  const retryableKeywords = [
    "503", "500", "502", "504",
    "timeout", "deadline exceeded",
    "service unavailable", "internal server error",
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
        logger.warn(`[LLM Retry] Attempt ${attempt} failed with retryable error: ${err.message || err}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

async function executeWithFallback(activeKey: string, method: 'generateContent' | 'generateContentStream', options: any): Promise<any> {
  const httpOptions: any = { apiVersion: '' };
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    httpOptions.baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  }
  
  const directClient = new GoogleGenAI({
    apiKey: activeKey,
    httpOptions
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
      logger.info({ model: attemptModel, contentsSize: attemptOptions.contents?.length || 0 }, "GEMINI INVOCATION DIAGNOSTICS");
      
      if (method === 'generateContent') {
        return await executeWithRetry(() => directClient.models.generateContent(attemptOptions));
      } else {
        return await executeWithRetry(() => directClient.models.generateContentStream(attemptOptions));
      }
    } catch (err: any) {
      const status = err?.status || err?.response?.status || err?.code;
      const statusStr = String(status || "").toUpperCase();
      const errMessage = String(err?.message || err?.stack || err).toLowerCase();
      
      const isQuotaExhausted = status === 429 || statusStr === "RESOURCE_EXHAUSTED" || errMessage.includes("quota") || errMessage.includes("429");
      const isModelNotFound = status === 404 || errMessage.includes("not found");
      
      if (isQuotaExhausted) {
        throw err; // Throw upwards to rotate the API key
      }
      
      const isRetryable = isRetryableLlmError(err) || isModelNotFound;
      
      if (isRetryable && !isLast) {
        logger.warn(`Widget API error on model ${attemptModel}, falling back to next model...`);
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

const keyUsageStats: Record<string, { inFlight: number, lastUsed: number }> = {};

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
    logger.error({ err }, "Widget public router: failed to load project keys");
  }

  try {
    // 2. User Keys (Project Owner)
    if (userId) {
      userKeysList = await db.query.userApiKeys.findMany({
        where: eq(userApiKeys.userId, userId)
      });

      for (const key of userKeysList) {
        if (!key.isEnabled) continue;

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
    logger.error({ err }, "Widget public router: failed to load user keys");
  }

  try {
    // 3. System Keys
    systemKeysList = await db.query.userApiKeys.findMany({
      where: isNull(userApiKeys.userId)
    });

    for (const key of systemKeysList) {
      if (!key.isEnabled) continue;

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
    logger.error({ err }, "Widget public router: failed to load system keys");
  }

  // Note: The previous fallback logic that retried keys marked as QUOTA_EXCEEDED has been removed.
  // When no HEALTHY keys are available, it is better to fail-fast than to spam rate-limited keys.

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

  // Calculate statistics
  let totalKeys = projectKeysList.length + userKeysList.length + systemKeysList.length + envKeys.length;
  let disabledKeys = 0;
  
  for (const k of projectKeysList) if (!k.isEnabled) disabledKeys++;
  for (const k of userKeysList) if (!k.isEnabled) disabledKeys++;
  for (const k of systemKeysList) if (!k.isEnabled) disabledKeys++;
  // envKeys are always considered enabled
  
  let enabledKeys = totalKeys - disabledKeys;

  logger.info(`\n--- API KEY MANAGER ---`);
  logger.info(`Total API keys loaded: ${totalKeys}`);
  logger.info(`Enabled API keys: ${enabledKeys}`);
  logger.info(`Disabled API keys: ${disabledKeys}`);
  logger.info(`-----------------------\n`);

  // Sort: Project Keys (primary first) -> User Keys -> System Keys -> Env Keys
  // Within the same priority group, sort by:
  // 1. inFlight count (ascending - pick the least busy key)
  // 2. lastUsed time (ascending - LRU)
  return widgetKeys.sort((a, b) => {
    const priority = { project: 1, user: 2, system: 3, env: 4 };
    if (priority[a.type] !== priority[b.type]) {
      return priority[a.type] - priority[b.type];
    }
    if (a.type === 'project' && b.type === 'project') {
      const ap = a.rawDbKey?.isPrimary ? 1 : 0;
      const bp = b.rawDbKey?.isPrimary ? 1 : 0;
      if (bp !== ap) return bp - ap;
    }
    
    // Concurrency / Load Balancing
    const statA = keyUsageStats[a.id || a.decryptedKey] || { inFlight: 0, lastUsed: 0 };
    const statB = keyUsageStats[b.id || b.decryptedKey] || { inFlight: 0, lastUsed: 0 };
    
    if (statA.inFlight !== statB.inFlight) {
      return statA.inFlight - statB.inFlight;
    }
    
    return statA.lastUsed - statB.lastUsed;
  });
}

import { updateKeyStats } from "../services/api-health";

async function executeKeyRequest(key: WidgetKey, method: 'generateContent' | 'generateContentStream', options: any): Promise<any> {
  const selectedModel = options.model || key.model || "gemini-2.0-flash";

  // Validate that the selected model belongs to the selected provider
  let isModelValid = true;
  const lowerModel = selectedModel.toLowerCase();
  const lowerProvider = key.provider.toLowerCase();

  // 1. Strict provider-model mismatch rules
  if (lowerProvider === "gemini" && !lowerModel.includes("gemini") && !lowerModel.includes("learnlm")) {
    isModelValid = false;
  } else if (lowerProvider !== "gemini" && lowerProvider !== "claude" && (lowerModel.includes("gemini") || lowerModel.includes("learnlm"))) {
    isModelValid = false;
  }

  // 2. Database available models restriction
  if (isModelValid && key.rawDbKey?.availableModels && Array.isArray(key.rawDbKey.availableModels) && key.rawDbKey.availableModels.length > 0) {
    isModelValid = key.rawDbKey.availableModels.includes(selectedModel);
  }

  if (!isModelValid) {
    throw new Error(`Invalid model for selected provider.`);
  }

  let sdkName = "GoogleGenAI SDK";
  let endpointName = "Google Gemini API";
  if (lowerProvider === "claude") {
    sdkName = "Anthropic SDK";
    endpointName = "api.anthropic.com";
  } else if (lowerProvider !== "gemini") {
    sdkName = "OpenAI SDK";
    if (lowerProvider === "groq") endpointName = "api.groq.com/openai/v1";
    else if (lowerProvider === "openrouter") endpointName = "openrouter.ai/api/v1";
    else if (lowerProvider === "deepseek") endpointName = "api.deepseek.com/v1";
    else endpointName = "api.openai.com/v1";
  }

  logger.info(`\n--- Execution Diagnostics ---`);
  logger.info(`Selected Provider: ${key.provider}`);
  logger.info(`Selected Model: ${selectedModel}`);
  logger.info(`Selected SDK: ${sdkName}`);
  logger.info(`Selected Endpoint: ${endpointName}`);
  logger.info(`Selected API Key: ${key.id || 'env'}`);
  logger.info(`---------------------------\n`);
  
  if (key.provider !== 'gemini') {
    const adapter = new UniversalProviderAdapter({
      provider: key.provider,
      apiKey: key.decryptedKey,
      model: selectedModel
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

    if (method === 'generateContent') {
      const response = await adapter.generateChat({
        messages,
        temperature: 0.7
      });
      return { text: response.content };
    } else {
      return adapter.generateChatStream({
        messages,
        temperature: 0.7
      });
    }
  } else {
    return await executeWithFallback(key.decryptedKey, method, { ...options, model: selectedModel });
  }
}

async function executeLlmWithFailover(
  keys: WidgetKey[], 
  method: 'generateContent' | 'generateContentStream', 
  options: any
): Promise<{ result: any; keyUsed: WidgetKey }> {
  logger.info(`\nLoaded API Keys: ${keys.length}\n`);
  
  const failures: string[] = [];
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const statKey = key.id || key.decryptedKey;
    
    if (!keyUsageStats[statKey]) {
      keyUsageStats[statKey] = { inFlight: 0, lastUsed: 0 };
    }
    
    logger.info(`Trying API Key #${i + 1}`);
    keyUsageStats[statKey].inFlight += 1;
    keyUsageStats[statKey].lastUsed = Date.now();
    
    const startTime = Date.now();
    const selectedModel = key.model || options.model || "gemini-2.0-flash";
    const attemptOptions = { ...options, model: selectedModel };

    try {
      // Check rate limit tracker before making network request
      const rpm = await minuteCache.get(`rpm:${statKey}`);
      if (rpm >= 30) { // Default safe rate limit estimate if provider headers aren't parsed
        throw { status: 429, message: "Rate limit estimated exceeded by MinuteCache" };
      }

      await minuteCache.incrementAndGet(`rpm:${statKey}`, 60, 1);
      
      const result = await executeKeyRequest(key, method, attemptOptions);
      
      const latencyMs = Date.now() - startTime;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      // Extract usage if available
      if (result && typeof result === 'object' && result.usage) {
        promptTokens = result.usage.promptTokens || 0;
        completionTokens = result.usage.completionTokens || 0;
        totalTokens = result.usage.totalTokens || 0;
      }

      await updateKeyStats({
        key,
        success: true,
        latencyMs,
        status: "HEALTHY",
        promptTokens,
        completionTokens,
        totalTokens,
        model: selectedModel
      }).catch(e => logger.error("Key success update error:", e));
      
      logger.info(`Success (${latencyMs}ms)\n`);
      return { result, keyUsed: key };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      
      const isTransient = err?.status === 503 || err?.status === 502 || err?.status === 504 || err?.status === 500 ||
                          String(err?.message || "").toLowerCase().includes("timeout") || String(err?.message || "").toLowerCase().includes("unavailable");
                          
      if (isTransient) {
        logger.warn(`[Widget API Failover] Skipping database unhealthy lock for key ${key.id || 'env'} because the failure was transient.`);
      } else {
        await updateKeyStats({
          key,
          success: false,
          latencyMs,
          status: "UNHEALTHY", // Will be reclassified by classifyError
          error: err,
          model: selectedModel
        }).catch(e => logger.error("Key failure update error:", e));
      }

      const failureReason = err?.message || err?.toString() || "Unknown error";
      logger.info(`${failureReason}\n`);
      failures.push(`Key #${i + 1} (${key.id || 'env'}): ${failureReason}`);
      
      if (i < keys.length - 1) {
        logger.info(`Reason for switching: ${failureReason}`);
        logger.info(`Switching to API Key #${i + 2}\n`);
      }
    } finally {
      // Always decrement inFlight when request finishes (success or failure)
      keyUsageStats[statKey].inFlight = Math.max(0, keyUsageStats[statKey].inFlight - 1);
    }
  }
  
  logger.info("All API keys failed:");
  failures.forEach(f => logger.info(`- ${f}`));
  
  throw new Error(`No healthy API keys available to execute the request. Failures: ${failures.join(" | ")}`);
}

const router = Router();

// Middleware to validate origin and project entitlement for widget routes
router.use(async (req: Request, res: Response, next): Promise<any> => {
  // Extract token from URL path robustly, ignoring any empty segments caused by double slashes
  const pathSegments = req.path.split('/').filter(Boolean);
  const pathToken = pathSegments[0]; 
  const widgetToken = req.params?.widgetToken || req.body?.widgetToken || req.query?.widgetToken || pathToken;
  
  if (!widgetToken) {
    return sendSafeError(res, 401, "MISSING_TOKEN", "Missing widget token", req);
  }

  try {
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.widgetToken, widgetToken as string)
    });

    if (!settings || !settings.isEnabled) {
      return sendSafeError(res, 403, "INVALID_WIDGET_TOKEN", "Invalid or disabled widget token", req);
    }

    // 1. Domain Authorization Check
    const originCheck = validateWidgetOrigin(req, settings.allowedDomains || []);
    if (!originCheck.valid) {
      req.log.warn({ domain: originCheck.domain, reason: originCheck.reason }, "Domain not authorized for widget token");
      return sendSafeError(
        res,
        403,
        "DOMAIN_NOT_ALLOWED",
        "Domain not authorized",
        req,
        { domain: originCheck.domain }
      );
    }

    // 2. Server-side Entitlement Check (with lazy trial activation)
    const entitlement = await checkProjectEntitlement(settings.projectId);
    
    // Attach projectId and entitlement state to request
    (req as any).projectId = settings.projectId;
    (req as any).entitlement = entitlement;

    const isConfigRoute = req.path.endsWith("/config");
    if (!entitlement.allowed && !isConfigRoute) {
      req.log.warn(
        { projectId: settings.projectId, status: entitlement.status },
        "Widget request blocked due to entitlement status"
      );
      return sendSafeError(
        res,
        403,
        entitlement.status,
        entitlement.message || "Your trial has expired. Please upgrade to continue.",
        req,
        { expiresAt: entitlement.expiresAt }
      );
    }

    return next();
  } catch (error) {
    req.log.error({ err: error }, "Widget validation error");
    return sendSafeError(res, 500, "INTERNAL_ERROR", "Internal server error", req);
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

    const entitlement = (req as any).entitlement;
    const isLocked = entitlement && !entitlement.allowed;
    const lockedReason = isLocked ? (entitlement.message || "Subscription or Trial expired.") : undefined;

    // Return safe configuration (no keys, no internal ids if possible)
    return res.json({
      botName: settings.botName,
      botAvatar: settings.botAvatar,
      welcomeMessage: isLocked ? lockedReason : settings.welcomeMessage,
      themeColor: settings.themeColor,
      position: settings.position,
      displayMode: settings.displayMode,
      customCss: settings.customCss,
      customContainerId: settings.customContainerId,
      humanHandoffLinks: settings.humanHandoffLinks,
      leadsEnabled: settings.leadsEnabled,
      isLocked: isLocked,
      lockedReason: lockedReason,
      entitlementStatus: entitlement?.status,
      expiresAt: entitlement?.expiresAt,
      contextEngine: contextSettings ? {
        enabled: !isLocked && contextSettings.enabled,
        maxContextSizeBytes: contextSettings.maxContextSizeBytes,
        developerDebugMode: contextSettings.developerDebugMode
      } : { enabled: false, maxContextSizeBytes: 6144, developerDebugMode: false }
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to fetch widget config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:widgetToken/chat", async (req: Request, res: Response): Promise<any> => {
  const { messages, websiteContext, sessionId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    req.log.error("EARLY RETURN: Invalid messages format", req.body);
    return res.status(400).json({ error: "Invalid messages format" });
  }

  const lastUserMsg = messages[messages.length - 1]?.content || "";
  if (detectPromptInjection(lastUserMsg)) {
    req.log.warn({ lastUserMsg }, "[SECURITY] Public widget prompt injection blocked");
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ content: "I cannot fulfill requests that attempt to bypass safety guidelines or access internal instructions." })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return res;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const projectId = (req as any).projectId;
    req.log.info({ widgetToken: req.params.widgetToken, projectId }, "Widget incoming request");

    // Get project details to know the owner's userId for key failover/rotation
    let project;
    try {
      project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      req.log.info({ projectId: project?.id }, "STEP 4: Loaded project");
    } catch (err: any) {
      req.log.error({ err }, "Failed Loading project...");
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
      req.log.error({ err: e }, "Failed to track analytics");
    }

    // Quota Usage Verification
    const quotaCheck = await checkAndIncrementUsage(projectId, "message", 1);
    if (!quotaCheck.allowed) {
      req.log.warn({ projectId, reason: quotaCheck.reason }, "Quota limits exceeded for project chat widget");
      res.write(`data: ${JSON.stringify({ content: "Monthly message limits for this chatbot have been reached. Please contact the administrator or upgrade your subscription." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return res;
    }

    // Resolve & Manage Keys with Failover
    const keys = await fetchAndManageWidgetKeys(projectId, userId);

    if (keys.length === 0) {
      req.log.error("EARLY RETURN: No AI API keys configured");
      res.write(`data: ${JSON.stringify({ content: "Sorry, no AI API keys are configured for this chatbot. Please configure an API key in your dashboard." })}\n\n`);
      res.end();
      return res;
    }

    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const previousAssistantMessage = messages.length >= 2 ? messages[messages.length - 2]?.content : "";

    // Track Lead & Frequent Questions asynchronously in background
    if (lastUserMessage) {
      processAndSaveLead({
        projectId,
        sessionId,
        sourcePageUrl: websiteContext?.url,
        userMessage: lastUserMessage,
      }).catch((e) => req.log.error({ err: e }, "Background lead processing error"));

      trackUserQuestion({
        projectId,
        questionText: lastUserMessage,
      }).catch((e) => req.log.error({ err: e }, "Background question tracking error"));
    }

    // 1. Check if the user is pointing out a mistake
    let userIsPointingOutMistake = false;
    const isCorrectionTriggerWord = lastUserMessage.match(/\b(wrong|mistake|incorrect|false|error|fix|correct|not right|bullshit|fake)\b/i);
    
    if (isCorrectionTriggerWord && messages.length >= 3) {
      try {
        const confirmPrompt = `Analyze the user's message and determine if they are indicating that the assistant made a mistake, gave a wrong or incorrect answer in the previous turn, or is correcting/updating the assistant's facts.
        
        User Message: "${lastUserMessage}"
        
        Respond with only "YES" or "NO".`;
        
        const mistakeHash = nodeCrypto.createHash("sha256").update(confirmPrompt).digest("hex");
        const cachedMistake = await llmResponseCache.get(mistakeHash);

        if (cachedMistake) {
          if (cachedMistake.trim().toUpperCase() === "YES") {
            userIsPointingOutMistake = true;
          }
        } else {
          const { result: confirmRes } = await executeLlmWithFailover(keys, 'generateContent', {
            model: "gemini-2.0-flash",
            contents: confirmPrompt
          });
          
          if (confirmRes.text) {
            await llmResponseCache.set(mistakeHash, confirmRes.text, 86400); // 24 hours
            if (confirmRes.text?.trim().toUpperCase() === "YES") {
              userIsPointingOutMistake = true;
            }
          }
        }
      } catch (err) {
        req.log.error({ err }, "Error confirming correction");
      }
    }

    // 2. Correction flow using Google Search
    if (userIsPointingOutMistake) {
      res.write(`data: ${JSON.stringify({ content: "ðŸ” *Checking Google Search to verify and correct my answer...*\n\n" })}\n\n`);
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
        req.log.error({ err }, "Error in correction flow");
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
      req.log.info({ found: !!contextSettings }, "Loaded context settings");
    } catch (err: any) {
      req.log.error({ err }, "Failed Loading context settings...");
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
      req.log.error({ err }, "Failed processing website context...");
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
      req.log.error({ err }, "Failed contextFuser() step...");
      throw err;
    }

    let handoffInfo = "";
    try {
      const widgetSettings = await db.query.projectWidgetSettings.findFirst({
        where: eq(projectWidgetSettings.projectId, projectId)
      });
      req.log.info({ found: !!widgetSettings }, "STEP 5: Loaded widget settings");
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
      req.log.error({ err }, "Error fetching widget settings for handoff");
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
      req.log.error({ err }, "Failed buildContextAwarePrompt()...");
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

      const intentHash = nodeCrypto.createHash("sha256").update(`${projectId}:${intentPrompt}`).digest("hex");
      const cachedIntent = await llmResponseCache.get(intentHash);

      if (cachedIntent) {
        intentType = cachedIntent;
      } else {
        const { result: intentRes } = await executeLlmWithFailover(keys, 'generateContent', {
          model: "gemini-2.0-flash",
          contents: [{ role: "user", parts: [{ text: intentPrompt }] }],
          config: { responseMimeType: "application/json" }
        });
        
        try {
          const parsed = JSON.parse(intentRes.text || "{}");
          if (parsed.intent) {
            intentType = parsed.intent;
            await llmResponseCache.set(intentHash, intentType, 300); // 5 minutes safe TTL
          }
        } catch (e) {
          req.log.error({ err: e }, "Failed to parse intent JSON");
        }
      }
    } catch (e) {
      req.log.error({ err: e }, "Intent detection failed, defaulting to GENERAL_QUESTION");
    }
    
    req.log.info(`[WIDGET ROUTING] Detected Intent: ${intentType}`);

    let customerId: string | undefined = undefined;
    let customerVerified = false;
    try {
      if (sessionId) {
        const sessionRec = await db.query.chatSessions.findFirst({
          where: eq(chatSessions.id, sessionId)
        });
        if (sessionRec?.customerId) {
          customerId = sessionRec.customerId;
          const custRec = await db.query.customers.findFirst({
            where: eq(customers.id, customerId)
          });
          if (custRec) {
            customerVerified = custRec.isVerified;
          }
        }
      }
    } catch (err) {
      req.log.warn({ err }, "Could not resolve customer identity for widget session");
    }

    try {
      // 1. Delegate request to CoordinatorAgent -> BusinessAgent pipeline
      const { CoordinatorAgent } = require("../agents/coordinator");
      const coordinator = new CoordinatorAgent();
      const coordRes = await coordinator.execute({
        projectId,
        sessionId,
        userId: userId || "public_visitor",
        customerContext: {
          customerId,
          verified: customerVerified,
          isBusinessAdmin: false
        },
        payload: {
          message: lastUserMessage,
          intent: lastUserMessage,
          confirmationToken: req.body?.confirmationToken,
          context: finalWebsiteContext
        }
      });

      if (coordRes.success && coordRes.data?.intent) {
        const bData = coordRes.data;

        if (bData.status === "PENDING_CONFIRMATION") {
          res.write(`data: ${JSON.stringify({ activity: "Confirmation required" })}\n\n`);
          res.write(`data: ${JSON.stringify({
            status: "PENDING_CONFIRMATION",
            requiresConfirmation: true,
            confirmationToken: bData.confirmationToken,
            actionId: bData.actionId,
            riskLevel: bData.riskLevel,
            toolExecuted: bData.toolExecuted,
            content: bData.response
          })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return res;
        }

        if (bData.intent === "action" && bData.status === "COMPLETED") {
          res.write(`data: ${JSON.stringify({ activity: "Executing authorized server tool..." })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
          res.write(`data: ${JSON.stringify({ activity: "Verifying execution status..." })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
          res.write(`data: ${JSON.stringify({ activity: "Completed" })}\n\n`);
          res.write(`data: ${JSON.stringify({ content: bData.response, toolExecuted: bData.toolExecuted, result: bData.result })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return res;
        }

        if (bData.intent === "clarification" || bData.intent === "unsupported") {
          res.write(`data: ${JSON.stringify({ content: bData.response })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return res;
        }

        if ((bData.intent === "general_conversation" || bData.intent === "business_information" || bData.intent === "information") && bData.response) {
          res.write(`data: ${JSON.stringify({ content: bData.response })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return res;
        }
      }

      // If intent was ACTION_REQUEST for browser steps
      if (intentType === "ACTION_REQUEST" && coordRes.success && coordRes.data?.action) {
        const payload = { 
          action: coordRes.data.action,
          executionId: coordRes.data.executionId,
          security: coordRes.data.security
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return res;
      }

      // 2. Fallback to conversational LLM stream with context
      const llmPromptHash = nodeCrypto.createHash("sha256").update(JSON.stringify(chatMessages)).digest("hex");
      const cachedResponse = await llmResponseCache.get(llmPromptHash);

      let fullResponseText = "";

      if (cachedResponse) {
        req.log.info("[LLM_CACHE_HIT] Widget duplicate prompt detected, returning cached response");
        res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();
        fullResponseText = cachedResponse;
      } else {
        const { result: stream } = await executeLlmWithFailover(keys, 'generateContentStream', {
          contents: chatMessages as any
        });
        
        for await (const chunk of stream) {
          if (chunk.text) {
            fullResponseText += chunk.text;
            res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
          }
        }
        
        if (fullResponseText) {
          await llmResponseCache.set(llmPromptHash, fullResponseText, 300); // 5 minutes
        }
      }

      // Track Knowledge Gap if AI returned fallback response or retrieved no context
      if (isFallbackResponse(fullResponseText) || (!fusedContext?.knowledgeChunks || fusedContext.knowledgeChunks.length === 0)) {
        trackKnowledgeGap({
          projectId,
          questionText: lastUserMessage,
          sessionId,
          sourceUrl: websiteContext?.url,
          confidence: "low",
          reason: isFallbackResponse(fullResponseText) ? "AI_FALLBACK" : "NO_RAG_MATCH",
        }).catch((e) => req.log.error({ err: e }, "Background knowledge gap tracking error"));
      }
    } catch (err: any) {
      req.log.error({ err }, "executeLlmWithFailover threw an error");
      res.write(`data: ${JSON.stringify({ content: "I'm sorry, I'm having trouble connecting to my backend systems right now. Please try again later." })}\n\n`);
      res.end();
      return res;
    }
    
    res.end();
    return res;

  } catch (error: any) {
    req.log.error({ err: error }, "Widget chat general error");
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
    req.log.error("Swarm dryrun error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Action Engine Result Webhook

router.post("/:widgetToken/action-result", async (req: Request, res: Response): Promise<any> => {
  const { executionId, actionId, status, tool, duration, url, domDelta, verification, error, confirmationToken } = req.body;
  if (!executionId || !actionId) {
    return res.status(400).json({ error: "Missing executionId or actionId" });
  }

  try {
    const projectId = (req as any).projectId;

    const [step] = await db.select().from(executionSteps).where(eq(executionSteps.id, actionId)).limit(1);
    if (!step) {
      return res.status(404).json({ error: "Execution step not found" });
    }

    if (step.status === "pending_approval") {
      const [execRecord] = await db.select().from(workflowExecutions).where(eq(workflowExecutions.id, executionId)).limit(1);
      const verified = await verifyActionConfirmationToken(confirmationToken, {
        userId: (req as any).auth?.userId || "public_visitor",
        projectId,
        sessionId: execRecord?.sessionId || "",
        actionId,
        actionType: step.actionType || "",
        actionTarget: step.actionTarget || ""
      });

      if (!verified) {
        req.log.warn({ actionId, executionId }, "Failed action confirmation token verification");
        await db.update(executionSteps).set({ status: "failed", error: "Invalid action confirmation token." }).where(eq(executionSteps.id, actionId));
        return res.status(403).json({ error: "Action confirmation token invalid or expired." });
      }
    }
    
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
          }).catch(err => req.log.error("Async execution error:", err));
       }, 0);
    }
    
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error("Action result error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public Lead Capture Endpoint
router.post("/:widgetToken/leads", async (req: Request, res: Response): Promise<any> => {
  const { widgetToken } = req.params;
  const { name, email, phone, company, sessionId, sourcePageUrl, userIntent } = req.body;
  try {
    const token = Array.isArray(widgetToken) ? widgetToken[0] : widgetToken;
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.widgetToken, token),
    });
    if (!settings) {
      return res.status(404).json({ error: "Widget token invalid or not found" });
    }

    // 1. Identify or Create Customer
    let customerId: string | null = null;
    let customerVerified = false;

    // Check if customer exists by email
    if (email) {
      const existing = await db.query.customers.findFirst({
        where: and(eq(customers.projectId, settings.projectId), eq(customers.email, email))
      });
      
      if (existing) {
        customerId = existing.id;
        customerVerified = existing.isVerified; // Keep existing verification status
        
        // Update phone/name if missing
        if (!existing.phone && phone || !existing.name && name) {
          await db.update(customers).set({
            phone: existing.phone || phone,
            name: existing.name || name,
            updatedAt: new Date()
          }).where(eq(customers.id, existing.id));
        }
      }
    }

    // If still no customer, create an unverified customer record
    if (!customerId && (email || phone || name)) {
      const [newCust] = await db.insert(customers).values({
        projectId: settings.projectId,
        name: name || "Anonymous Lead",
        email: email || null,
        phone: phone || null,
        channel: "website",
        isVerified: false, // Widget leads are unverified by default unless proven otherwise
      }).returning();
      customerId = newCust.id;
    }

    // Also link the session to this customer if we have one
    if (customerId && sessionId) {
      await db.update(chatSessions).set({ customerId }).where(eq(chatSessions.id, sessionId));
    }

    const lead = await processAndSaveLead({
      projectId: settings.projectId,
      sessionId,
      sourcePageUrl,
      userMessage: [name, email, phone, company, userIntent].filter(Boolean).join(" "),
    });

    if (lead) {
      return res.json({ success: true, lead, customerId });
    }

    // Direct fallback insertion if signals were not triggered
    const [insertedLead] = await db.insert(widgetLeads).values({
      projectId: settings.projectId,
      name: name || "Anonymous Lead",
      email: email || null,
      phone: phone || null,
      company: company || null,
      sessionId: sessionId || null,
      sourcePageUrl: sourcePageUrl || null,
      userIntent: userIntent || "direct_form",
      status: "NEW",
      score: (email || phone) ? "HIGH" : "MEDIUM",
      scoreValue: (email || phone) ? 80 : 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return res.json({ success: true, lead: insertedLead, customerId });
  } catch (err: any) {
    req.log.error("Failed to capture public lead:", err);
    return res.status(500).json({ error: "Failed to capture lead" });
  }
});

export default router;



router.post("/projects/:projectId/messages/:messageId/feedback", async (req, res): Promise<any> => {
  try {
    const { projectId, messageId } = req.params;
    const { sessionId, type, comment, channel = "WEBSITE" } = req.body;
    
    if (!sessionId || !type) return res.status(400).json({ error: "Missing required fields" });
    if (type !== "LIKE" && type !== "DISLIKE") return res.status(400).json({ error: "Invalid type" });
    
    const [session] = await db.select({ customerId: chatSessions.customerId }).from(chatSessions).where(eq(chatSessions.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    await submitMessageFeedback({ projectId, sessionId, messageId, customerId: session.customerId || undefined, type, comment, channel });
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error(err, "Error submitting message feedback");
    return res.status(400).json({ error: "Error submitting feedback" });
  }
});

router.post("/projects/:projectId/feedback", async (req, res): Promise<any> => {
  try {
    const { projectId } = req.params;
    const { sessionId, category, rating, comment, channel = "WEBSITE" } = req.body;
    
    if (!comment) return res.status(400).json({ error: "Comment is required" });
    
    let customerId = undefined;
    if (sessionId) {
      const [session] = await db.select({ customerId: chatSessions.customerId }).from(chatSessions).where(eq(chatSessions.id, sessionId));
      if (session && session.customerId) customerId = session.customerId;
    }
    
    await submitProjectFeedback({ projectId, customerId, category, rating, comment, channel });
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error(err, "Error submitting project feedback");
    return res.status(400).json({ error: "Error submitting feedback" });
  }
});
