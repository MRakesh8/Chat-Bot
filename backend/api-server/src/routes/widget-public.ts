import { submitMessageFeedback, submitProjectFeedback } from '../services/feedback';
import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { db, crypto, withBypassRLS } from "@workspace/db";
import {
  projectWidgetSettings,
  projects,
  knowledgeSources,
  knowledgeChunks,
  projectApiKeys,
  userApiKeys,
  widgetAnalytics,
  apiLogs,
  widgetLeads,
  chatSessions,
  messages as messagesTable,
  customers,
  workflowExecutions,
  executionSteps,
  projectLocalSessions,
  projectIntegrations,
  integrationTools,
  browserCapabilities,
  agentWorkflows,
} from "@workspace/db/schema";
import { eq, and, isNull, or, desc } from "drizzle-orm";
import { emitActivityEvent } from "../services/activity";
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
  checkProjectEntitlementWithContext,
  redactSensitiveContext,
  sendSafeError,
  getRequestId,
  checkAndIncrementUsage,
  verifyActionConfirmationToken,
  isLocalhostOrigin,
} from "../security";
import { processAndSaveLead } from "../services/lead-detection";
import { trackUserQuestion } from "../services/question-normalization";
import { trackKnowledgeGap, isFallbackResponse } from "../services/unanswered-questions";


import { UniversalRouterService } from '../services/ai-router';

interface WidgetKey { id?: string; type?: string; }
const keyUsageStats: Record<string, any> = {};

const CAPABILITY_CACHE_TTL_MS = 60_000;
const executableCapabilityCache = new Map<string, { hasCapabilities: boolean; expiresAt: number }>();

async function checkProjectHasExecutableCapabilities(projectId: string): Promise<boolean> {
  const cached = executableCapabilityCache.get(projectId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.hasCapabilities;
  }
  try {
    const [integRows, toolRows, browserRows, workflowRows] = await Promise.all([
      db.select({ id: projectIntegrations.id }).from(projectIntegrations)
        .where(and(eq(projectIntegrations.projectId, projectId), or(eq(projectIntegrations.status, "AUTHORIZED"), eq(projectIntegrations.status, "CONNECTED"))))
        .limit(1),
      db.select({ id: integrationTools.id }).from(integrationTools)
        .where(and(eq(integrationTools.projectId, projectId), eq(integrationTools.isEnabled, true)))
        .limit(1),
      db.select({ id: browserCapabilities.id }).from(browserCapabilities)
        .where(and(eq(browserCapabilities.projectId, projectId), eq(browserCapabilities.isEnabled, true)))
        .limit(1),
      db.select({ id: agentWorkflows.id }).from(agentWorkflows)
        .where(eq(agentWorkflows.projectId, projectId))
        .limit(1),
    ]);
    const hasCapabilities = integRows.length > 0 || toolRows.length > 0 || browserRows.length > 0 || workflowRows.length > 0;
    if (executableCapabilityCache.size >= 1000) {
      const oldestKey = executableCapabilityCache.keys().next().value;
      if (oldestKey) executableCapabilityCache.delete(oldestKey);
    }
    executableCapabilityCache.set(projectId, { hasCapabilities, expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS });
    return hasCapabilities;
  } catch {
    return true;
  }
}

function looksLikeActionRequest(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (/^\s*(how\s+(do|can|to)|what\s+(is|are)|why|who|where|when|tell\s+me\s+about|explain|describe)\b/i.test(trimmed) &&
      !/\b(click|press|tap|fill|navigate|go\s+to|submit|scroll|cancel\s+my|track\s+my|check\s+my|refund\s+my)\b/i.test(trimmed)) {
    return false;
  }
  return /\b(click|press|tap|fill(\s+out|\s+in)?|navigate|go\s+to|redirect|open\s+(the\s+)?(page|link|form|modal|tab|dashboard|checkout)|submit(\s+the)?\s+form|create\s+(a|an|new)|update\s+(my|the)|delete\s+(my|the)|remove\s+(my|the)|cancel\s+(my|the|order)|refund\s+(my|the|order)|book\s+(a|an|the)|schedule\s+(a|an|the)|track\s+(my|the)\s+order|check\s+(my|the)\s+(order|booking|ticket|status)|execute|run\s+workflow)\b/i.test(trimmed);
}

async function fetchAndManageWidgetKeys(projectId: string, userId: string | null): Promise<WidgetKey[]> {
  return [{}];
}

async function executeLlmWithFailover(
  keys: WidgetKey[], 
  method: 'generateContent' | 'generateContentStream', 
  options: any, 
  projectId?: string, 
  userId?: string | null,
  retryOpts?: {
    deadlineMs?: number;
    maxRetries?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
    preResolvedCandidates?: any[];
    disableThinking?: boolean;
    onTiming?: (stage: string, durationMs: number, meta?: Record<string, any>) => void;
  }
): Promise<{ result: any, keyUsed: WidgetKey }> {
  
  const req = {
    capabilities: method === 'generateContentStream' ? { textGeneration: true, streaming: true } : { textGeneration: true },
    projectId,
    userId: userId || undefined,
    preferredModel: options.model,
    operation: 'chat' as const,
    preResolvedCandidates: retryOpts?.preResolvedCandidates,
    disableThinking: retryOpts?.disableThinking,
    onTiming: retryOpts?.onTiming,
  };

  const chatMessages = (options.contents || []).map((m: any) => ({
    role: (m.role === 'model' || m.role === 'assistant') ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
    content: m.parts?.[0]?.text || m.content || ''
  }));

  const rawSystemInst = options.config?.systemInstruction;
  const systemInst = typeof rawSystemInst === 'string'
    ? rawSystemInst
    : rawSystemInst?.parts?.[0]?.text;
  if (systemInst) {
    chatMessages.unshift({ role: 'system', content: systemInst });
  }

  const routerOpts = {
    deadlineMs: retryOpts?.deadlineMs ?? (method === 'generateContentStream' ? 20000 : 12000),
    maxRetries: retryOpts?.maxRetries ?? 1,
    maxDelayMs: retryOpts?.maxDelayMs ?? 1000,
    signal: retryOpts?.signal
  };

  if (method === 'generateContent') {
    const res = await UniversalRouterService.executeChat(req, chatMessages, options.config?.temperature, routerOpts);
    const content = res.content || '';
    return { result: { text: content, getText: () => content }, keyUsed: {} };
  } else {
    const stream = await UniversalRouterService.executeStream(req, chatMessages, options.config?.temperature, routerOpts);
    return { 
      result: (async function*() {
        for await (const chunk of stream) {
          if (retryOpts?.signal?.aborted) break;
          const text = chunk.text || '';
          yield { text, getText: () => text };
        }
      })(), 
      keyUsed: {} 
    };
  }
}


const router = Router();

// Middleware to validate origin and project entitlement for widget routes
router.use(async (req: Request, res: Response, next): Promise<any> => {
  const mwStart = Date.now();
  const correlationId = getRequestId(req) || nodeCrypto.randomUUID();
  res.setHeader("X-Request-Id", correlationId);
  const widgetTimings: Record<string, any> = {
    request_received_epoch_ms: mwStart,
  };

  // Extract token from URL path robustly, ignoring any empty segments caused by double slashes
  const pathSegments = req.path.split('/').filter(Boolean);
  const pathToken = pathSegments[0] === "public" ? pathSegments[1] : pathSegments[0]; 
  const widgetToken = req.params?.widgetToken || req.body?.widgetToken || req.query?.widgetToken || pathToken;
  
  if (!widgetToken) {
    return sendSafeError(res, 401, "MISSING_TOKEN", "Missing widget token", req);
  }

  try {
    const rawOrigin = (req.headers.origin || req.headers.referer || "") as string;
    const isLocalOrigin = isLocalhostOrigin(rawOrigin);

    const resolved = await withBypassRLS(async (tx: any) => {
      const [settings] = await tx
        .select()
        .from(projectWidgetSettings)
        .where(eq(projectWidgetSettings.widgetToken, widgetToken as string))
        .limit(1);

      if (!settings || !settings.isEnabled) {
        return { settings: settings || null, originCheck: null as any, entCtx: null as any };
      }

      // 1. Domain Authorization Check
      let originCheck = validateWidgetOrigin(req, settings.allowedDomains || []);
      if (!originCheck.valid && isLocalOrigin) {
        try {
          const [activeLocalSession] = await tx
            .select()
            .from(projectLocalSessions)
            .where(
              and(
                eq(projectLocalSessions.projectId, settings.projectId),
                or(
                  eq(projectLocalSessions.status, "CONNECTED"),
                  eq(projectLocalSessions.status, "READY"),
                  eq(projectLocalSessions.status, "TESTING")
                ),
                isNull(projectLocalSessions.revokedAt)
              )
            )
            .orderBy(desc(projectLocalSessions.createdAt))
            .limit(1);

          if (activeLocalSession) {
            const isNotExpired = !activeLocalSession.expiresAt || new Date(activeLocalSession.expiresAt).getTime() > Date.now();
            if (isNotExpired) {
              originCheck = { valid: true, domain: "localhost" };
            }
          }
        } catch (sessionCheckErr) {
          req.log.warn({ err: sessionCheckErr }, "Could not check project_local_sessions for widget origin");
        }
      }

      if (!originCheck.valid) {
        return { settings, originCheck, entCtx: null as any };
      }

      // 2. Server-side Entitlement Check (consolidated in same TX; returns project & license snapshot)
      const entCtx = await checkProjectEntitlementWithContext(settings.projectId, false, tx);
      return { settings, originCheck, entCtx };
    });

    const { settings, originCheck, entCtx } = resolved;

    if (!settings || !settings.isEnabled) {
      return sendSafeError(res, 403, "INVALID_WIDGET_TOKEN", "Invalid or disabled widget token", req);
    }

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

    const entitlement = entCtx.entitlement;
    widgetTimings.tenant_resolution_ms = Date.now() - mwStart;
    
    // Attach projectId, entitlement state, and preloaded snapshots to request
    (req as any).projectId = settings.projectId;
    (req as any).entitlement = entitlement;
    (req as any).widgetSettings = settings;
    (req as any).project = entCtx.project ?? null;
    (req as any).license = entCtx.license ?? null;
    (req as any).correlationId = correlationId;
    (req as any).widgetTimings = widgetTimings;

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

router.get(["/:widgetToken/config", "/public/:widgetToken/config"], async (req: Request, res: Response): Promise<any> => {
  try {
    // Prevent caching of the configuration so CSS/theme updates reflect instantly in production
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const projectId = (req as any).projectId;
    const preloadedSettings = (req as any).widgetSettings;

    const [settings, contextSettings] = await Promise.all([
      preloadedSettings
        ? Promise.resolve(preloadedSettings)
        : withBypassRLS(async (tx: any) => {
            const [s] = await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, projectId)).limit(1);
            return s;
          }),
      withBypassRLS(async (tx: any) => {
        const [cs] = await tx.select().from(projectContextSettings).where(eq(projectContextSettings.projectId, projectId)).limit(1);
        return cs;
      }),
    ]);

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
      inputPlaceholder: (settings as any).inputPlaceholder || "Ask a question...",
      onlineStatus: (settings as any).onlineStatus || "Online",
      appearance: (settings as any).appearance || { themeMode: "all" },
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

router.post(["/:widgetToken/chat", "/public/:widgetToken/chat"], async (req: Request, res: Response): Promise<any> => {
  const { messages, websiteContext, sessionId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    req.log.error("EARLY RETURN: Invalid messages format");
    return res.status(400).json({ error: "Invalid messages format" });
  }

  const correlationId = (req as any).correlationId || getRequestId(req) || nodeCrypto.randomUUID();
  const baseTimings = (req as any).widgetTimings || {};
  const reqStart = typeof baseTimings.request_received_epoch_ms === "number"
    ? baseTimings.request_received_epoch_ms
    : Date.now();
  const stageTimings: Record<string, any> = {
    ...baseTimings,
    correlationId,
  };
  const recordTiming = (stage: string, durationMs: number, meta?: Record<string, any>) => {
    stageTimings[`${stage}_ms`] = durationMs;
    if (meta && Object.keys(meta).length > 0) {
      stageTimings[`${stage}_meta`] = meta;
    }
  };

  // Track real client socket disconnects (res.on('close') with !res.writableEnded;
  // note req.on('close') fires falsely in Node 24 once body parsing completes)
  const requestAbortController = new AbortController();
  let isClientDisconnected = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      isClientDisconnected = true;
      requestAbortController.abort();
    }
  });

  // Defer SSE headers until first response chunk to prevent false HTTP 200 on pre-stream error
  const ensureSseHeaders = () => {
    if (!res.headersSent && !isClientDisconnected) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("X-Request-Id", correlationId);
      if (typeof (res as any).flushHeaders === "function") {
        (res as any).flushHeaders();
      }
    }
  };

  const lastUserMsg = String(messages[messages.length - 1]?.content || "");
  if (detectPromptInjection(lastUserMsg)) {
    req.log.warn({ correlationId, msgLength: lastUserMsg.length }, "[SECURITY] Public widget prompt injection blocked");
    ensureSseHeaders();
    res.write(`data: ${JSON.stringify({ content: "I cannot fulfill requests that attempt to bypass safety guidelines or access internal instructions." })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return res;
  }

  try {
    const projectId = (req as any).projectId;
    const widgetSettings = (req as any).widgetSettings;
    const license = (req as any).license;
    let project = (req as any).project;
    const hadPreloadedProject = Boolean(project);

    req.log.info({ correlationId, projectId }, "Widget incoming request");

    if (!project) {
      project = await withBypassRLS(async (tx: any) => {
        const [p] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
        return p || null;
      });
    }
    const userId = project ? project.userId : null;

    const lastUserMessage = lastUserMsg;
    const previousAssistantMessage = messages.length >= 2 ? String(messages[messages.length - 2]?.content || "") : "";
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuidSessionId = Boolean(sessionId && UUID_RE.test(sessionId));

    // Pre-Flight Parallel Stage: quota + contextSettings + chatSession/message + key resolution
    const preflightStart = Date.now();
    const [quotaCheck, loadedContextSettings, sessionResult, preResolvedCandidates] = await Promise.all([
      checkAndIncrementUsage(projectId, "message", 1, false, {
        organizationId: project?.organizationId,
        license,
        hasLicenseSnapshot: hadPreloadedProject,
      }),
      withBypassRLS(async (tx: any) => {
        const [cs] = await tx
          .select()
          .from(projectContextSettings)
          .where(eq(projectContextSettings.projectId, projectId))
          .limit(1);
        return cs;
      }),
      (async () => {
        let dbSessionId: string | null = null;
        let customerId: string | undefined = undefined;
        let customerVerified = false;

        if (isUuidSessionId) {
          try {
            const existingSession = await db.query.chatSessions.findFirst({
              where: and(eq(chatSessions.id, sessionId), eq(chatSessions.projectId, projectId))
            });
            if (existingSession) {
              dbSessionId = existingSession.id;
              customerId = existingSession.customerId || undefined;
              const [, custRec] = await Promise.all([
                db.update(chatSessions)
                  .set({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) })
                  .where(eq(chatSessions.id, dbSessionId)),
                customerId
                  ? db.query.customers.findFirst({ where: eq(customers.id, customerId) })
                  : Promise.resolve(null),
              ]);
              if (custRec) {
                customerVerified = custRec.isVerified;
              }
            }
          } catch (err) {
            req.log.warn({ err, correlationId }, "Error checking existing chat session");
          }
        }

        if (!dbSessionId) {
          try {
            const newSessionId = isUuidSessionId ? sessionId : nodeCrypto.randomUUID();
            const [createdSession] = await db.insert(chatSessions).values({
              id: newSessionId,
              projectId,
              userId: null, // Website widget visitor sessions belong to projectId (not personal user sessions)
              title: lastUserMessage ? (lastUserMessage.slice(0, 50) + (lastUserMessage.length > 50 ? "..." : "")) : "Website Visitor Chat",
              expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            }).returning();
            if (createdSession) {
              dbSessionId = createdSession.id;
              emitActivityEvent({
                id: `session-${createdSession.id}`,
                type: "conversation_started",
                title: "New Visitor Conversation Started",
                detail: createdSession.title || "Website visitor connected",
                timestamp: createdSession.createdAt || new Date(),
                projectId,
                sessionId: createdSession.id,
              });
            }
          } catch (err) {
            req.log.error({ err, correlationId }, "Error inserting new widget chat session");
          }
        }

        if (dbSessionId && lastUserMessage) {
          try {
            const [savedMsg] = await db.insert(messagesTable).values({
              sessionId: dbSessionId,
              sender: "user",
              content: lastUserMessage,
            }).returning();
            if (savedMsg) {
              emitActivityEvent({
                id: `msg-${savedMsg.id}`,
                type: "message",
                title: "Incoming Visitor Query",
                detail: lastUserMessage,
                status: "DELIVERED",
                timestamp: savedMsg.createdAt || new Date(),
                projectId,
                sessionId: dbSessionId,
              });
            }
          } catch (err) {
            req.log.error({ err, correlationId }, "Error saving widget user message");
          }
        }

        return { dbSessionId, customerId, customerVerified };
      })(),
      (async () => {
        const kStart = Date.now();
        try {
          const candidates = await UniversalRouterService.resolveCandidates({
            capabilities: { textGeneration: true, streaming: true },
            projectId,
            userId: userId || undefined,
            operation: "chat",
          });
          recordTiming("api_key_resolution", Date.now() - kStart, {
            candidateCount: candidates.length,
            primaryProvider: candidates[0]?.provider,
          });
          return candidates;
        } catch (err) {
          recordTiming("api_key_resolution", Date.now() - kStart, { candidateCount: 0, error: true });
          return [] as any[];
        }
      })(),
    ]);
    recordTiming("preflight_parallel", Date.now() - preflightStart);

    if (isClientDisconnected || requestAbortController.signal.aborted) {
      return res.end();
    }

    const { dbSessionId, customerId, customerVerified } = sessionResult;

    if (!quotaCheck.allowed) {
      req.log.warn({ correlationId, projectId, reason: quotaCheck.reason }, "Quota limits exceeded for project chat widget");
      ensureSseHeaders();
      res.write(`data: ${JSON.stringify({ content: "Monthly message limits for this chatbot have been reached. Please contact the administrator or upgrade your subscription." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return res;
    }

    const keys = await fetchAndManageWidgetKeys(projectId, userId);
    const resolvedCandidatesOpt = preResolvedCandidates.length > 0 ? preResolvedCandidates : undefined;
    const geminiCandidate = preResolvedCandidates.find(
      (c: any) => c?.provider === "gemini" && typeof c?.credential?.apiKey === "string" && c.credential.apiKey.length > 0
    );
    const embeddingApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY
      ? undefined
      : geminiCandidate?.credential?.apiKey;

    // Helper to persist Assistant Message & post-stream analytics cleanly after stream delivery
    const saveAssistantMessage = async (assistantText: string) => {
      if (dbSessionId && assistantText && assistantText.trim()) {
        try {
          const [savedAiMsg] = await db.insert(messagesTable).values({
            sessionId: dbSessionId,
            sender: "assistant",
            content: assistantText.trim(),
          }).returning();
          await db.update(chatSessions)
            .set({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) })
            .where(eq(chatSessions.id, dbSessionId));
          if (savedAiMsg) {
            emitActivityEvent({
              id: `ai-${savedAiMsg.id}`,
              type: "ai_response",
              title: "AI Assistant Response",
              detail: assistantText.trim(),
              status: "DELIVERED",
              timestamp: savedAiMsg.createdAt || new Date(),
              projectId,
              sessionId: dbSessionId,
            });
          }
        } catch (err) {
          req.log.error({ err, correlationId }, "Error saving widget assistant message");
        }
      }
    };

    const recordWidgetAnalytics = async (outputChars: number) => {
      try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const estimatedTokens = Math.floor((JSON.stringify(messages).length + outputChars) / 4);

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
        req.log.error({ err: e, correlationId }, "Failed to track analytics");
      }
    };

    // Track Lead & Frequent Questions asynchronously in background
    if (lastUserMessage) {
      processAndSaveLead({
        projectId,
        sessionId: dbSessionId || (isUuidSessionId ? sessionId : undefined),
        sourcePageUrl: websiteContext?.url,
        userMessage: lastUserMessage,
      }).catch((e) => req.log.error({ err: e, correlationId }, "Background lead processing error"));

      trackUserQuestion({
        projectId,
        questionText: lastUserMessage,
      }).catch((e) => req.log.error({ err: e, correlationId }, "Background question tracking error"));
    }

    // 1. Check if the user is explicitly pointing out an assistant mistake (tightened to avoid triggering on normal troubleshooting queries)
    let userIsPointingOutMistake = false;
    const isCorrectionTriggerWord =
      /\b(that(?:'s| is)\s+(?:wrong|incorrect|false|not right)|you(?:'re| are)\s+wrong|made\s+a\s+mistake|previous\s+answer\s+(?:is|was)\s+(?:wrong|incorrect)|wrong\s+(?:answer|info|information)|bullshit|that(?:'s| is)\s+fake)\b/i.test(lastUserMessage);
    
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
          const { result: confirmRes } = await executeLlmWithFailover(
            keys,
            "generateContent",
            { contents: [{ role: "user", parts: [{ text: confirmPrompt }] }] },
            projectId,
            userId,
            {
              deadlineMs: 2500,
              maxRetries: 0,
              signal: requestAbortController.signal,
              preResolvedCandidates: resolvedCandidatesOpt,
              disableThinking: true,
            }
          );
          
          if (confirmRes.text) {
            await llmResponseCache.set(mistakeHash, confirmRes.text, 86400); // 24 hours
            if (confirmRes.text?.trim().toUpperCase() === "YES") {
              userIsPointingOutMistake = true;
            }
          }
        }
      } catch (err) {
        req.log.error({ err, correlationId }, "Error confirming correction");
      }
    }

    // 2. Correction flow using Google Search
    if (userIsPointingOutMistake) {
      ensureSseHeaders();
      res.write(`data: ${JSON.stringify({ content: "🔍 *Checking Google Search to verify and correct my answer...*\n\n" })}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      const verifyPrompt = `The user claims the assistant's previous answer was wrong or incomplete.
      Previous Assistant Answer: "${previousAssistantMessage}"
      User Message: "${lastUserMessage}"
      
      Perform a Google search to verify the facts and find the correct, up-to-date answer. Summarize the verified facts clearly.`;

      let verifiedText = "";
      try {
        const { result: searchRes } = await executeLlmWithFailover(
          keys,
          "generateContent",
          {
            contents: [{ role: "user", parts: [{ text: verifyPrompt }] }],
            config: {
              tools: [{ googleSearch: {} }]
            }
          },
          projectId,
          userId,
          {
            signal: requestAbortController.signal,
            preResolvedCandidates: resolvedCandidatesOpt,
            disableThinking: true,
          }
        );

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
        const corrSystemPrompt = `You are a helpful customer support chatbot. The user just corrected your previous answer, and you verified the correct info using Google Search.
        
        Verified Information from Google:
        ${verifiedText}
        
        ${project?.systemPrompt ? `CRITICAL PROJECT RULES YOU MUST STRICTLY FOLLOW:\n${project.systemPrompt}\n\n` : ''}Explain the correction politely, state that you've updated your knowledge base so you won't make this mistake again, and answer their question based on the verified information.`;

        const { result: stream } = await executeLlmWithFailover(
          keys,
          "generateContentStream",
          { contents: [{ role: "user", parts: [{ text: corrSystemPrompt }] }] },
          projectId,
          userId,
          {
            signal: requestAbortController.signal,
            preResolvedCandidates: resolvedCandidatesOpt,
            disableThinking: true,
          }
        );

        let correctionFullText = "";
        for await (const chunk of stream) {
          if (isClientDisconnected || requestAbortController.signal.aborted) break;
          if (chunk.text) {
            correctionFullText += chunk.text;
            res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
          }
        }
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        }
        if (correctionFullText) {
          await Promise.all([
            saveAssistantMessage(correctionFullText),
            recordWidgetAnalytics(correctionFullText.length),
          ]);
        }
      } catch (err) {
        req.log.error({ err, correlationId }, "Error in correction flow");
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ content: "Sorry, I encountered an error while verifying the information on Google." })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        }
      }
      return res;
    }

    // 3. Normal flow with Context Engine & Knowledge Base retrieval
    const contextStart = Date.now();
    const contextSettings = loadedContextSettings || {
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

    let finalWebsiteContext: any = null;
    let sessionMemory: any = null;

    try {
      if (contextSettings.enabled && websiteContext && sessionId) {
        // Reconstruct synchronously (handles delta merging and validates final context)
        finalWebsiteContext = deltaReconstructor.reconstruct(sessionId, websiteContext);
        if (finalWebsiteContext && contextSettings.contextMemory) {
          sessionMemory = sessionMemoryStore.update(sessionId, finalWebsiteContext);
        }
      }
    } catch (err: any) {
      req.log.error({ err, correlationId }, "Failed processing website context...");
      throw err;
    }

    // Run Knowledge Base retrieval & gated ACTION_REQUEST classification in parallel
    let intentType = "GENERAL_QUESTION";
    let intentDetectionFailed = false;
    let intentFallbackReason: string | null = null;
    const shouldCheckActionIntent = !req.body?.confirmationToken && looksLikeActionRequest(lastUserMessage);

    const detectIntentTask = async () => {
      const intentStart = Date.now();
      if (req.body?.confirmationToken) {
        intentType = "ACTION_REQUEST";
        recordTiming("intent_detection", 0, { mode: "confirmation_token" });
        return;
      }
      if (!shouldCheckActionIntent) {
        recordTiming("intent_detection", 0, { mode: "skipped_informational" });
        return;
      }

      try {
        const hasCapabilities = await checkProjectHasExecutableCapabilities(projectId);
        const hasDomContext = Boolean(finalWebsiteContext);
        if (!hasCapabilities && !hasDomContext) {
          recordTiming("intent_detection", Date.now() - intentStart, { mode: "skipped_no_capabilities" });
          return;
        }

        const intentPrompt = `Classify the user's intent based on their latest message: "${lastUserMessage}".
        
        Categories:
        - ACTION_REQUEST: The user is explicitly asking you to DO something or perform a transactional operation on the website (e.g., "Create a client", "Click the Add button", "Fill the form", "Navigate to dashboard", "Delete the invoice", "Update my profile", "Cancel order").
        - KNOWLEDGE_QUESTION: The user is asking for information, profile, team, services, projects, products, FAQs, pricing, or help that requires an explanation (e.g., "Who founded this company?", "What features does this service offer?", "What are the pricing tiers?", "How do I create a client?", "What is your return policy?").
        - GENERAL_QUESTION: Conversational chat, greetings, or generic questions.
        
        Output ONLY a JSON object with the format: {"intent": "CATEGORY_NAME"}`;

        const intentHash = nodeCrypto.createHash("sha256").update(`${projectId}:${intentPrompt}`).digest("hex");
        const cachedIntent = await llmResponseCache.get(intentHash);

        if (cachedIntent) {
          intentType = cachedIntent;
          recordTiming("intent_detection", Date.now() - intentStart, { mode: "cache_hit", intentType });
        } else {
          const INTENT_TIMEOUT_MS = 2000;
          const intentAbortController = new AbortController();
          const onParentAbort = () => intentAbortController.abort();
          requestAbortController.signal.addEventListener("abort", onParentAbort, { once: true });

          let timeoutHandle: any;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              intentAbortController.abort();
              reject(new Error("Intent detection deadline exceeded"));
            }, INTENT_TIMEOUT_MS);
          });

          const detectIntentPromise = executeLlmWithFailover(
            keys,
            "generateContent",
            {
              contents: [{ role: "user", parts: [{ text: intentPrompt }] }],
              config: { responseMimeType: "application/json" }
            },
            projectId,
            userId,
            {
              deadlineMs: INTENT_TIMEOUT_MS,
              maxRetries: 0,
              signal: intentAbortController.signal,
              preResolvedCandidates: resolvedCandidatesOpt,
              disableThinking: true,
            }
          );
          detectIntentPromise.catch(() => {});

          let intentRes: any;
          try {
            const raceResult = await Promise.race([detectIntentPromise, timeoutPromise]);
            intentRes = raceResult.result;
          } catch (e: any) {
            intentDetectionFailed = true;
            intentFallbackReason = (e?.message?.includes("deadline exceeded") || intentAbortController.signal.aborted)
              ? "DEADLINE_EXCEEDED"
              : "PROVIDER_ERROR";
            req.log.warn({ correlationId, reason: intentFallbackReason }, "Intent detection deadline exceeded / failed, defaulting to GENERAL_QUESTION");
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            requestAbortController.signal.removeEventListener("abort", onParentAbort);
          }

          if (intentRes) {
            try {
              const raw = (intentRes.text || "").trim();
              const cleanText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
              const parsed = JSON.parse(cleanText || "{}");
              if (parsed.intent) {
                intentType = parsed.intent;
                await llmResponseCache.set(intentHash, intentType, 300);
              }
            } catch (e) {
              req.log.warn({ err: e, correlationId }, "Failed to parse intent JSON, defaulting to GENERAL_QUESTION");
              intentDetectionFailed = true;
              intentFallbackReason = "PARSE_ERROR";
            }
          }
          recordTiming("intent_detection", Date.now() - intentStart, { mode: "llm", intentType, failed: intentDetectionFailed });
        }
      } catch (e: any) {
        intentDetectionFailed = true;
        intentFallbackReason = e?.message || "UNEXPECTED_ERROR";
        req.log.warn({ err: e, correlationId }, "Intent detection failed, defaulting to GENERAL_QUESTION");
        recordTiming("intent_detection", Date.now() - intentStart, { mode: "error" });
      }
    };

    const fuseTask = (async () => {
      try {
        return await contextFuser.fuse({
          userMessage: lastUserMessage,
          websiteContext: finalWebsiteContext,
          projectId,
          userId,
          customerId,
          settings: contextSettings as any,
          apiKeys: keys,
          conversationHistory: messages,
          signal: requestAbortController.signal,
          embeddingApiKey,
          onTiming: recordTiming,
        });
      } catch (err: any) {
        req.log.error({ err, correlationId }, "Failed contextFuser() step...");
        throw err;
      }
    })();

    const [fusedContext] = await Promise.all([fuseTask, detectIntentTask()]);

    if (isClientDisconnected || requestAbortController.signal.aborted) {
      return res.end();
    }

    // Build human handoff info directly from middleware-preloaded widgetSettings (0 DB queries)
    let handoffInfo = "";
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

    let systemPrompt: string;
    try {
      systemPrompt = buildContextAwarePrompt({
        project: project as any,
        fusedContext,
        sessionMemory,
        settings: contextSettings as any,
        handoffInfo
      });
    } catch (err: any) {
      req.log.error({ err, correlationId }, "Failed buildContextAwarePrompt()...");
      throw err;
    }

    recordTiming("context_construction", Date.now() - contextStart, {
      promptChars: systemPrompt.length,
      kbChars: fusedContext?.kbContextString?.length ?? 0,
      retrievedCount: fusedContext?.knowledgeChunks?.length ?? 0,
    });

    // Window recent history to avoid multi-turn token bloat and pass native systemInstruction
    const MAX_HISTORY_TURNS = 14;
    const windowedMessages = messages.slice(-MAX_HISTORY_TURNS);
    const chatMessages = windowedMessages.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user"),
      parts: [{ text: String(m.content || "") }]
    }));

    if (intentDetectionFailed) {
      req.log.info({ correlationId }, `[WIDGET ROUTING] Intent detection fell back to default: ${intentType} (reason: ${intentFallbackReason})`);
    } else {
      req.log.info({ correlationId }, `[WIDGET ROUTING] Detected Intent: ${intentType}`);
    }

    try {
      // 1. Delegate strictly ACTION_REQUEST to CoordinatorAgent -> BusinessAgent pipeline
      if (intentType === "ACTION_REQUEST" || req.body?.confirmationToken) {
        const { CoordinatorAgent } = require("../agents/coordinator");
        const coordinator = new CoordinatorAgent();
        const coordRes = await coordinator.execute({
          projectId,
          sessionId,
          userId: userId || "public_visitor",
          signal: requestAbortController.signal,
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

        if (coordRes.success && coordRes.data) {
          const bData = coordRes.data;

          if (bData.status === "PENDING_CONFIRMATION") {
            ensureSseHeaders();
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
            await Promise.all([
              saveAssistantMessage(bData.response),
              recordWidgetAnalytics((bData.response || "").length),
            ]);
            return res;
          }

          if (bData.intent === "action" && bData.status === "COMPLETED") {
            ensureSseHeaders();
            res.write(`data: ${JSON.stringify({ activity: "Executing authorized server tool..." })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
            res.write(`data: ${JSON.stringify({ activity: "Verifying execution status..." })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
            res.write(`data: ${JSON.stringify({ activity: "Completed" })}\n\n`);
            res.write(`data: ${JSON.stringify({ content: bData.response, toolExecuted: bData.toolExecuted, result: bData.result })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            await Promise.all([
              saveAssistantMessage(bData.response),
              recordWidgetAnalytics((bData.response || "").length),
            ]);
            return res;
          }

          if (bData.action) {
            ensureSseHeaders();
            const payload = { 
              action: bData.action,
              executionId: bData.executionId,
              security: bData.security
            };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            await recordWidgetAnalytics(0);
            return res;
          }
        }
      }

      // 2. Conversational LLM stream with context & native systemInstruction
      const llmPromptHash = nodeCrypto
        .createHash("sha256")
        .update(`${projectId}:${customerId || "anon"}:${systemPrompt}:${JSON.stringify(chatMessages)}`)
        .digest("hex");
      const cachedResponse = await llmResponseCache.get(llmPromptHash);

      let fullResponseText = "";
      let cacheHit = false;
      let backendStreamStart = 0;
      let firstTokenSent = false;

      if (cachedResponse) {
        cacheHit = true;
        req.log.info({ correlationId }, "[LLM_CACHE_HIT] Widget duplicate prompt detected, returning cached response");
        ensureSseHeaders();
        backendStreamStart = Date.now();
        stageTimings.backend_ttft_ms = backendStreamStart - reqStart;
        firstTokenSent = true;
        res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();
        fullResponseText = cachedResponse;
      } else {
        const providerStartOffsetMs = Date.now() - reqStart;
        stageTimings.provider_request_start_offset_ms = providerStartOffsetMs;

        const { result: stream } = await executeLlmWithFailover(
          keys,
          "generateContentStream",
          {
            contents: chatMessages as any,
            config: {
              systemInstruction: { parts: [{ text: systemPrompt }] },
            },
          },
          projectId,
          userId,
          {
            deadlineMs: 25000,
            maxRetries: 1,
            maxDelayMs: 800,
            signal: requestAbortController.signal,
            preResolvedCandidates: resolvedCandidatesOpt,
            disableThinking: true,
            onTiming: (stage, durationMs, meta) => {
              if (stage === "provider_request_start") {
                stageTimings.provider_request_start_offset_ms = Date.now() - reqStart;
                if (meta) stageTimings.provider_meta = meta;
              } else {
                recordTiming(stage, durationMs, meta);
              }
            },
          }
        );
        
        for await (const chunk of stream) {
          if (isClientDisconnected || requestAbortController.signal.aborted) break;
          if (chunk.text) {
            ensureSseHeaders();
            if (!firstTokenSent) {
              firstTokenSent = true;
              backendStreamStart = Date.now();
              stageTimings.backend_ttft_ms = backendStreamStart - reqStart;
            }
            fullResponseText += chunk.text;
            res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
          }
        }
      }

      if (isClientDisconnected || requestAbortController.signal.aborted) {
        stageTimings.total_duration_ms = Date.now() - reqStart;
        req.log.info(
          { event: "WIDGET_CHAT_METRICS", correlationId, projectId, aborted: true, timings: stageTimings },
          "[WIDGET_CHAT_METRICS] Widget client disconnected before stream completion"
        );
        if (!res.writableEnded) res.end();
        return res;
      }

      if (!res.headersSent) {
        ensureSseHeaders();
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }

      stageTimings.backend_streaming_ms = firstTokenSent ? Date.now() - backendStreamStart : 0;
      stageTimings.total_duration_ms = Date.now() - reqStart;

      req.log.info(
        {
          event: "WIDGET_CHAT_METRICS",
          correlationId,
          projectId,
          intentType,
          cacheHit,
          outputChars: fullResponseText.length,
          timings: stageTimings,
        },
        "[WIDGET_CHAT_METRICS] Widget chat request completed"
      );

      const postTasks: Array<Promise<any>> = [
        recordWidgetAnalytics(fullResponseText.length),
      ];
      if (fullResponseText) {
        if (!cacheHit) {
          postTasks.push(llmResponseCache.set(llmPromptHash, fullResponseText, 300));
        }
        postTasks.push(saveAssistantMessage(fullResponseText));
      }
      if (isFallbackResponse(fullResponseText) || (!fusedContext?.knowledgeChunks || fusedContext.knowledgeChunks.length === 0)) {
        postTasks.push(
          trackKnowledgeGap({
            projectId,
            questionText: lastUserMessage,
            sessionId: dbSessionId || (isUuidSessionId ? sessionId : undefined),
            sourceUrl: websiteContext?.url,
            confidence: "low",
            reason: isFallbackResponse(fullResponseText) ? "AI_FALLBACK" : "NO_RAG_MATCH",
          }).catch((e) => req.log.error({ err: e, correlationId }, "Background knowledge gap tracking error"))
        );
      }
      await Promise.all(postTasks);
    } catch (err: any) {
      if (isClientDisconnected || requestAbortController.signal.aborted) {
        if (!res.writableEnded) res.end();
        return res;
      }
      req.log.error({ err, correlationId }, "executeLlmWithFailover threw an error in widget chat");
      if (!res.headersSent) {
        return res.status(503).json({
          error: "AI service temporarily unavailable. Please try again later.",
          code: "PROVIDER_UNAVAILABLE"
        });
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ content: "\n\nSorry, I encountered an issue connecting to the AI assistant. Please try again." })}\n\n`);
        res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service temporarily unavailable. Please try again later.", code: "PROVIDER_UNAVAILABLE" })}\n\n`);
        res.end();
      }
      return res;
    }
    
    return res;

  } catch (error: any) {
    if (isClientDisconnected || requestAbortController.signal.aborted) {
      if (!res.writableEnded) res.end();
      return res;
    }
    req.log.error({ err: error, correlationId }, "Widget chat general error");
    if (!res.headersSent) {
      return res.status(503).json({
        error: "AI service temporarily unavailable. Please try again later.",
        code: "PROVIDER_UNAVAILABLE"
      });
    }
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ content: "\n\nSorry, I encountered an issue connecting to the AI assistant. Please try again." })}\n\n`);
      res.write(`event: error\ndata: ${JSON.stringify({ error: "AI service temporarily unavailable. Please try again later.", code: "PROVIDER_UNAVAILABLE" })}\n\n`);
      res.end();
    }
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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(executionId) || !UUID_RE.test(actionId)) {
    return res.status(400).json({ error: "Invalid executionId or actionId format" });
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

    // UUID format guard — widget may send a non-UUID context-engine session ID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuidSession = sessionId && UUID_RE.test(sessionId);

    // Also link the session to this customer if we have a valid UUID session
    if (customerId && isUuidSession) {
      await db.update(chatSessions).set({ customerId }).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.projectId, settings.projectId)));
    }

    const lead = await processAndSaveLead({
      projectId: settings.projectId,
      sessionId: isUuidSession ? sessionId : undefined,
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
      sessionId: isUuidSession ? sessionId : null,
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

router.post("/:widgetToken/feedback", async (req: Request, res: Response): Promise<any> => {
  try {
    const projectId = (req as any).projectId;
    const { type, text } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: "Missing feedback type" });
    }

    let category = "AI_RESPONSE_LIKE";
    if (type === "SUGGESTION") {
      category = "SUGGESTION";
    } else if (type === "DISLIKE") {
      category = "AI_RESPONSE_DISLIKE";
    }
    
    await submitProjectFeedback({
      projectId,
      category,
      comment: text ? text.substring(0, 1000) : "No response text",
      channel: "WEBSITE",
    });

    return res.json({ success: true });
  } catch (err: any) {
    req.log?.error ? req.log.error(err, "Failed to submit widget AI feedback") : console.error("Failed to submit widget AI feedback", err);
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

export default router;



router.post("/projects/:projectId/messages/:messageId/feedback", async (req, res): Promise<any> => {
  try {
    const { projectId, messageId } = req.params;
    const { sessionId, type, comment, channel = "WEBSITE" } = req.body;
    
    if (!sessionId || !type) return res.status(400).json({ error: "Missing required fields" });
    if (type !== "LIKE" && type !== "DISLIKE") return res.status(400).json({ error: "Invalid type" });
    
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(sessionId)) return res.status(400).json({ error: "Invalid session ID format" });
    
    const [session] = await db.select({ customerId: chatSessions.customerId, projectId: chatSessions.projectId }).from(chatSessions).where(eq(chatSessions.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.projectId !== projectId) return res.status(403).json({ error: "Session does not belong to project" });
    
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
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (sessionId && UUID_RE.test(sessionId)) {
      const [session] = await db.select({ customerId: chatSessions.customerId, projectId: chatSessions.projectId }).from(chatSessions).where(eq(chatSessions.id, sessionId));
      if (session && session.projectId !== projectId) return res.status(403).json({ error: "Session does not belong to project" });
      if (session && session.customerId) customerId = session.customerId;
    }
    
    await submitProjectFeedback({ projectId, customerId, category, rating, comment, channel });
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error(err, "Error submitting project feedback");
    return res.status(400).json({ error: "Error submitting feedback" });
  }
});
