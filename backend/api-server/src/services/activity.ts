import { EventEmitter } from "events";
import {
  db,
  withTenantContext,
  projects,
  messages,
  chatSessions,
  widgetLeads,
  enterpriseAuditLogs,
  projectFeedback,
  messageFeedback,
  whatsappMessages,
  whatsappConversations,
} from "@workspace/db";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { getRedisClient } from "../lib/redis";
import { logger } from "../lib/logger";

export type ActivityType =
  | "message"
  | "ai_response"
  | "lead"
  | "tool_execution"
  | "conversation_started"
  | "feedback"
  | "integration"
  | "security"
  | "handoff";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  status?: string;
  timestamp: string;
  projectId: string;
  organizationId?: string;
  sessionId?: string;
  customerId?: string;
  metadata?: Record<string, any>;
}

export interface GetProjectActivityOptions {
  projectId: string;
  organizationId: string;
  limit?: number;
  types?: ActivityType[];
  before?: string; // ISO timestamp cursor
}

/**
 * Sanitize strings to avoid exposing credentials, API keys, bearer tokens, or internal prompts.
 */
export function sanitizeActivityText(text: string | null | undefined, maxLen = 300): string {
  if (!text || typeof text !== "string") return "";
  let clean = text.trim();

  // Redact API keys / tokens / bearer secrets
  clean = clean.replace(/(?:bearer\s+|key=|api[_-]?key[:=]\s*|token[:=]\s*)[a-zA-Z0-9_\-\.]{12,}/gi, "[REDACTED_SECRET]");
  // Redact authorization headers
  clean = clean.replace(/authorization:\s*[^\s]+/gi, "authorization: [REDACTED]");
  // Redact passwords
  clean = clean.replace(/(?:password|secret|pass)[:=]\s*[^\s,]+/gi, "password=[REDACTED]");
  // Redact database URIs
  clean = clean.replace(/postgres(?:ql)?:\/\/[^\s@]+@[^\s/]+/gi, "postgres://[REDACTED_HOST]");

  if (clean.length > maxLen) {
    clean = clean.substring(0, maxLen) + "...";
  }
  return clean;
}

/**
 * Sanitize metadata objects safely
 */
export function sanitizeMetadata(meta: any): Record<string, any> {
  if (!meta || typeof meta !== "object") return {};
  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    const lk = k.toLowerCase();
    if (
      lk.includes("secret") ||
      lk.includes("key") ||
      lk.includes("token") ||
      lk.includes("password") ||
      lk.includes("auth") ||
      lk.includes("credential")
    ) {
      sanitized[k] = "[REDACTED]";
    } else if (typeof v === "string") {
      sanitized[k] = sanitizeActivityText(v, 150);
    } else if (typeof v === "number" || typeof v === "boolean") {
      sanitized[k] = v;
    } else if (v && typeof v === "object") {
      sanitized[k] = Array.isArray(v) ? v.slice(0, 10) : "[OBJECT]";
    }
  }
  return sanitized;
}

/**
 * Centralized Real-time Event Bus for Live Business Activity
 */
class ActivityBus extends EventEmitter {
  private redisSubInitialized = false;

  constructor() {
    super();
    this.setMaxListeners(200);
    this.initRedisPubSub();
  }

  private initRedisPubSub() {
    const redis = getRedisClient();
    if (redis && !this.redisSubInitialized) {
      try {
        const subClient = redis.duplicate();
        subClient.subscribe("nova:live_activity_channel", (err) => {
          if (err) {
            logger.warn({ err }, "[ACTIVITY_BUS] Failed to subscribe to Redis live activity channel");
          } else {
            this.redisSubInitialized = true;
          }
        });

        subClient.on("message", (channel, message) => {
          if (channel === "nova:live_activity_channel") {
            try {
              const event: ActivityItem = JSON.parse(message);
              if (event && event.projectId) {
                this.emit(`project:${event.projectId}`, event);
                this.emit("activity", event);
              }
            } catch (e) {
              // Ignore invalid json
            }
          }
        });
      } catch (err) {
        logger.warn({ err }, "[ACTIVITY_BUS] Redis pubsub setup skipped");
      }
    }
  }

  /**
   * Broadcast real activity event to local listeners and Redis cluster
   */
  public emitEvent(event: ActivityItem) {
    if (!event || !event.projectId) return;

    // Local process emission
    this.emit(`project:${event.projectId}`, event);
    this.emit("activity", event);

    // Redis broadcast across distributed server replicas
    const redis = getRedisClient();
    if (redis) {
      try {
        redis.publish("nova:live_activity_channel", JSON.stringify(event)).catch(() => {});
      } catch (err) {
        // Fallback gracefully
      }
    }
  }

  /**
   * Subscribe to real-time events for a specific project
   */
  public subscribe(projectId: string, listener: (event: ActivityItem) => void): () => void {
    const channel = `project:${projectId}`;
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }
}

export const activityBus = new ActivityBus();

/**
 * Emit a typed, sanitized real business activity event
 */
export function emitActivityEvent(payload: {
  id?: string;
  type: ActivityType;
  title: string;
  detail: string;
  status?: string;
  timestamp?: string | Date;
  projectId: string;
  organizationId?: string;
  sessionId?: string;
  customerId?: string;
  metadata?: Record<string, any>;
}): ActivityItem {
  const ts = payload.timestamp
    ? (typeof payload.timestamp === "string" ? payload.timestamp : payload.timestamp.toISOString())
    : new Date().toISOString();

  const item: ActivityItem = {
    id: payload.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: payload.type,
    title: sanitizeActivityText(payload.title, 120),
    detail: sanitizeActivityText(payload.detail, 250),
    status: payload.status,
    timestamp: ts,
    projectId: payload.projectId,
    organizationId: payload.organizationId,
    sessionId: payload.sessionId,
    customerId: payload.customerId,
    metadata: sanitizeMetadata(payload.metadata),
  };

  activityBus.emitEvent(item);
  return item;
}

/**
 * Fetch truthful, persistent, multi-source activity from the database
 * with strict project and tenant isolation.
 */
export async function getProjectActivity(options: GetProjectActivityOptions): Promise<ActivityItem[]> {
  const { projectId, organizationId, limit = 25, before } = options;
  const safeLimit = Math.max(1, Math.min(limit, 100));

  return await withTenantContext(organizationId, async (tx: any) => {
    // Strictly verify that the requested project belongs to the tenant organization (fail-closed IDOR guard)
    const [project] = await tx.select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return [];
    }

    const items: ActivityItem[] = [];

    // 1. Fetch Leads
    try {
      const leads = await tx.select()
        .from(widgetLeads)
        .where(
          before
            ? and(eq(widgetLeads.projectId, projectId), lt(widgetLeads.createdAt, new Date(before)))
            : eq(widgetLeads.projectId, projectId)
        )
        .orderBy(desc(widgetLeads.createdAt))
        .limit(safeLimit);

      for (const lead of leads) {
        const isHigh = lead.score === "HIGH";
        const contact = [lead.name, lead.email, lead.phone, lead.company].filter(Boolean).join(" • ");
        items.push({
          id: `lead-${lead.id}`,
          type: "lead",
          title: isHigh ? `High Intent Lead: ${lead.name || lead.email || "Visitor"}` : `Lead Captured: ${lead.name || lead.email || "Visitor"}`,
          detail: sanitizeActivityText(contact || lead.userIntent || "Contact information saved"),
          status: isHigh ? "HIGH_INTENT" : (lead.status || "NEW"),
          timestamp: lead.createdAt ? new Date(lead.createdAt).toISOString() : new Date().toISOString(),
          projectId,
          sessionId: lead.sessionId || undefined,
          metadata: {
            score: lead.score,
            scoreValue: lead.scoreValue,
            status: lead.status,
          }
        });
      }
    } catch (err) {
      logger.warn({ err, projectId }, "[ACTIVITY_FETCH] Failed querying widgetLeads");
    }

    // 2. Fetch Messages (Visitor & AI Assistant)
    try {
      const msgs = await tx.select({
        id: messages.id,
        content: messages.content,
        sender: messages.sender,
        createdAt: messages.createdAt,
        sessionId: messages.sessionId,
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(
        before
          ? and(eq(chatSessions.projectId, projectId), lt(messages.createdAt, new Date(before)))
          : eq(chatSessions.projectId, projectId)
      )
      .orderBy(desc(messages.createdAt))
      .limit(safeLimit);

      for (const msg of msgs) {
        const isUser = msg.sender === "user";
        items.push({
          id: isUser ? `msg-${msg.id}` : `ai-${msg.id}`,
          type: isUser ? "message" : "ai_response",
          title: isUser ? "Incoming Visitor Query" : "AI Assistant Response",
          detail: sanitizeActivityText(msg.content, 140),
          status: "DELIVERED",
          timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
          projectId,
          sessionId: msg.sessionId,
        });
      }
    } catch (err) {
      logger.warn({ err, projectId }, "[ACTIVITY_FETCH] Failed querying messages");
    }

    // 3. Fetch Enterprise Audit Logs (Tool Executions, Security, Integrations)
    try {
      const audits = await tx.select()
        .from(enterpriseAuditLogs)
        .where(
          before
            ? and(eq(enterpriseAuditLogs.projectId, projectId), lt(enterpriseAuditLogs.timestamp, new Date(before)))
            : eq(enterpriseAuditLogs.projectId, projectId)
        )
        .orderBy(desc(enterpriseAuditLogs.timestamp))
        .limit(safeLimit);

      for (const audit of audits) {
        const details = audit.details || {};
        const isSecurity = audit.actionType?.includes("SECURITY") || audit.actionType?.includes("DENIED") || details.status === "DENIED";
        const actionName = details.actionName || details.toolExecuted || audit.actionType?.replace(/^TOOL_/, "");
        
        items.push({
          id: `audit-${audit.id}`,
          type: isSecurity ? "security" : "tool_execution",
          title: isSecurity
            ? `Security Policy: ${audit.actionType || "Blocked Action"}`
            : `Tool Executed: ${actionName || "Business Action"}`,
          detail: sanitizeActivityText(
            details.providerName
              ? `Provider: ${details.providerName} • Status: ${details.status || "COMPLETED"}`
              : details.error
              ? `Error: ${details.error}`
              : `Status: ${details.status || "COMPLETED"}`
          ),
          status: details.status || (audit.actionType?.includes("SUCCESS") ? "SUCCESS" : "COMPLETED"),
          timestamp: audit.timestamp ? new Date(audit.timestamp).toISOString() : new Date().toISOString(),
          projectId,
          metadata: {
            durationMs: details.durationMs,
            riskLevel: details.riskLevel,
            status: details.status,
          }
        });
      }
    } catch (err) {
      logger.warn({ err, projectId }, "[ACTIVITY_FETCH] Failed querying enterpriseAuditLogs");
    }

    // 4. Fetch Feedback
    try {
      const pFeedback = await tx.select()
        .from(projectFeedback)
        .where(
          before
            ? and(eq(projectFeedback.projectId, projectId), lt(projectFeedback.createdAt, new Date(before)))
            : eq(projectFeedback.projectId, projectId)
        )
        .orderBy(desc(projectFeedback.createdAt))
        .limit(10);

      for (const fb of pFeedback) {
        items.push({
          id: `pfb-${fb.id}`,
          type: "feedback",
          title: fb.rating ? `Customer Rating: ${fb.rating}★` : "Customer Feedback Submitted",
          detail: sanitizeActivityText(fb.comment || fb.category || "Feedback received"),
          status: fb.rating && fb.rating >= 4 ? "POSITIVE" : "NEUTRAL",
          timestamp: fb.createdAt ? new Date(fb.createdAt).toISOString() : new Date().toISOString(),
          projectId,
          customerId: fb.customerId || undefined,
        });
      }
    } catch (err) {
      logger.warn({ err, projectId }, "[ACTIVITY_FETCH] Failed querying projectFeedback");
    }

    // 5. Fetch WhatsApp Messages (if any)
    try {
      const waMsgs = await tx.select({
        id: whatsappMessages.id,
        content: whatsappMessages.content,
        direction: whatsappMessages.direction,
        sender: whatsappMessages.sender,
        aiGenerated: whatsappMessages.aiGenerated,
        createdAt: whatsappMessages.createdAt,
        conversationId: whatsappMessages.conversationId,
      })
      .from(whatsappMessages)
      .innerJoin(whatsappConversations, eq(whatsappMessages.conversationId, whatsappConversations.id))
      .where(
        before
          ? and(eq(whatsappConversations.projectId, projectId), lt(whatsappMessages.createdAt, new Date(before)))
          : eq(whatsappConversations.projectId, projectId)
      )
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(15);

      for (const wa of waMsgs) {
        const isAi = wa.aiGenerated === true;
        items.push({
          id: `wa-${wa.id}`,
          type: isAi ? "ai_response" : "message",
          title: isAi ? "WhatsApp AI Reply" : `WhatsApp Query (${wa.sender || "Customer"})`,
          detail: sanitizeActivityText(wa.content, 120),
          status: "DELIVERED",
          timestamp: wa.createdAt ? new Date(wa.createdAt).toISOString() : new Date().toISOString(),
          projectId,
        });
      }
    } catch (err) {
      // Table may be empty or not configured yet
    }

    // Deduplicate by stable ID
    const uniqueMap = new Map<string, ActivityItem>();
    for (const item of items) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    }

    // Sort newest-first
    const sorted = Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return sorted.slice(0, safeLimit);
  });
}
