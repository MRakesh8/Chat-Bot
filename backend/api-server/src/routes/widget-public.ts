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


import { UniversalRouterService } from '../services/ai-router';

interface WidgetKey { id?: string; type?: string; }
const keyUsageStats: Record<string, any> = {};

async function fetchAndManageWidgetKeys(projectId: string, userId: string | null): Promise<WidgetKey[]> {
  return [{}];
}

async function executeLlmWithFailover(
  keys: WidgetKey[], 
  method: 'generateContent' | 'generateContentStream', 
  options: any, 
  projectId?: string, 
  userId?: string | null
): Promise<{ result: any, keyUsed: WidgetKey }> {
  
  const req = {
    capabilities: method === 'generateContentStream' ? { textGeneration: true, streaming: true } : { textGeneration: true },
    projectId,
    userId: userId || undefined,
    preferredModel: options.model,
    operation: 'chat' as const
  };

  const chatMessages = (options.contents || []).map((m: any) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.parts?.[0]?.text || m.content || ''
  }));

  const systemInst = options.config?.systemInstruction?.parts?.[0]?.text;
  if (systemInst) {
    chatMessages.unshift({ role: 'system', content: systemInst });
  }

  if (method === 'generateContent') {
    const res = await UniversalRouterService.executeChat(req, chatMessages, options.config?.temperature);
    return { result: { text: () => res.content, text_value: res.content }, keyUsed: {} };
  } else {
    const stream = await UniversalRouterService.executeStream(req, chatMessages, options.config?.temperature);
    return { 
      result: (async function*() {
        for await (const chunk of stream) {
          yield { text: () => chunk.text, text_value: chunk.text };
        }
      })(), 
      keyUsed: {} 
    };
  }
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
        sessionId: (sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) ? sessionId : undefined,
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

    // UUID v4 format validation — the widget's context engine sends a short
    // client-generated ID (Math.random base-36) as sessionId which is used
    // only for in-memory delta reconstruction / session memory.  We must NOT
    // pass non-UUID values to the chat_sessions.id (uuid) column.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuidSessionId = sessionId && UUID_RE.test(sessionId);

    let customerId: string | undefined = undefined;
    let customerVerified = false;
    try {
      if (isUuidSessionId) {
        const sessionRec = await db.query.chatSessions.findFirst({
          where: and(eq(chatSessions.id, sessionId), eq(chatSessions.projectId, projectId))
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
      } else if (sessionId) {
        req.log.debug({ sessionId }, "Widget sessionId is not a UUID — skipping chat_sessions lookup (context-engine client ID)");
      }
    } catch (err) {
      req.log.warn({ err }, "Could not resolve customer identity for widget session");
    }

    // Fuse context & KB
    let fusedContext;
    try {
      fusedContext = await contextFuser.fuse({
        userMessage: lastUserMessage,
        websiteContext: finalWebsiteContext,
        projectId,
        userId,
        customerId,
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
          sessionId: isUuidSessionId ? sessionId : undefined,
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

    const category = type === "LIKE" ? "AI_RESPONSE_LIKE" : "AI_RESPONSE_DISLIKE";
    
    await submitProjectFeedback({
      projectId,
      category,
      comment: text ? text.substring(0, 1000) : "No response text",
      channel: "WEBSITE",
    });

    return res.json({ success: true });
  } catch (err: any) {
    req.log.error("Failed to submit widget AI feedback:", err);
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
