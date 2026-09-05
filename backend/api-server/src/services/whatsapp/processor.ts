import { db, crypto } from "@workspace/db";
import { 
  whatsappConnections, whatsappConversations, whatsappMessages, 
  whatsappSettings, whatsappHandoffs, projects, whatsappAnalytics
} from "@workspace/db/schema";
import { eq, and, lte, or, sql, isNull } from "drizzle-orm";
import { NormalizedWhatsAppMessage, WhatsAppProvider } from "./provider";
import { logger } from "../../lib/logger";
import { searchProjectKnowledge } from "../knowledge";
import { ai } from "@workspace/integrations-gemini-ai";
import { projectApiKeys, userApiKeys } from "@workspace/db/schema";

// Import adapters
import { TimelinesAIProvider } from "./providers/timelines";
import { MetaBusinessProvider } from "./providers/meta";

const providers: Record<string, WhatsAppProvider> = {
  timelinesai: new TimelinesAIProvider(),
  meta: new MetaBusinessProvider()
};

const LEASE_DURATION_MS = 60000; // 1 minute

export class WhatsAppProcessor {

  /**
   * Enqueue a message for processing. Implements idempotency via Unique Constraint.
   */
  static async enqueue(normalized: NormalizedWhatsAppMessage): Promise<{ enqueued: boolean, messageId?: string }> {
    try {
      // 1. Verify connection and project
      const connection = await db.query.whatsappConnections.findFirst({
        where: and(
          eq(whatsappConnections.id, normalized.connectionId),
          eq(whatsappConnections.projectId, normalized.projectId),
          eq(whatsappConnections.provider, normalized.provider)
        )
      });
      if (!connection) {
        logger.error({ ...normalized }, "Connection mismatch during enqueue");
        return { enqueued: false };
      }

      // 2. Get or create conversation
      let conversation = await db.query.whatsappConversations.findFirst({
        where: and(
          eq(whatsappConversations.projectId, normalized.projectId),
          eq(whatsappConversations.connectionId, normalized.connectionId),
          eq(whatsappConversations.providerChatId, normalized.providerChatId)
        )
      });

      if (!conversation) {
        const [newConv] = await db.insert(whatsappConversations).values({
          projectId: normalized.projectId,
          connectionId: normalized.connectionId,
          providerChatId: normalized.providerChatId,
          customerIdentifier: normalized.customerIdentifier,
          customerName: normalized.customerName,
          status: "active",
          assignedMode: "ai"
        }).returning();
        conversation = newConv;
      }

      // 3. Insert message (idempotent)
      const [msg] = await db.insert(whatsappMessages).values({
        projectId: normalized.projectId,
        conversationId: conversation.id,
        providerMessageId: normalized.providerMessageId,
        provider: normalized.provider,
        direction: "inbound",
        sender: normalized.customerIdentifier,
        messageType: "text",
        content: normalized.text,
        status: "pending"
      }).onConflictDoNothing({ 
        target: [whatsappMessages.projectId, whatsappMessages.provider, whatsappMessages.providerMessageId] 
      }).returning();

      if (!msg) {
        // Message already exists (duplicate webhook)
        return { enqueued: false };
      }

      return { enqueued: true, messageId: msg.id };
    } catch (err) {
      logger.error({ err, normalized }, "Failed to enqueue WhatsApp message");
      return { enqueued: false };
    }
  }

  /**
   * Process a single message via lease/claim
   */
  static async processMessage(messageId: string): Promise<void> {
    try {
      // 1. Claim message (atomic)
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);
      
      const [claimedMsg] = await db.update(whatsappMessages)
        .set({ 
          status: "processing", 
          leaseUntil,
          processingStartedAt: now,
          processingAttempts: sql`processing_attempts + 1`
        })
        .where(
          and(
            eq(whatsappMessages.id, messageId),
            or(
              eq(whatsappMessages.status, "pending"),
              and(
                eq(whatsappMessages.status, "processing"),
                lte(whatsappMessages.leaseUntil, now) // Expired lease recovery
              )
            )
          )
        )
        .returning();

      if (!claimedMsg) {
        // Already processed or claimed by another worker
        return;
      }

      // 2. Load dependencies
      const conversation = await db.query.whatsappConversations.findFirst({
        where: eq(whatsappConversations.id, claimedMsg.conversationId)
      });
      if (!conversation) throw new Error("Conversation not found");

      const connection = await db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.id, conversation.connectionId)
      });
      if (!connection) throw new Error("Connection not found");

      const settings = await db.query.whatsappSettings.findFirst({
        where: eq(whatsappSettings.projectId, claimedMsg.projectId)
      });

      const project = await db.query.projects.findFirst({
        where: eq(projects.id, claimedMsg.projectId)
      });
      if (!project) throw new Error("Project not found");

      // 3. Check Settings & Handoff
      if (conversation.assignedMode === "human" || conversation.status === "human_required") {
        await db.update(whatsappMessages).set({ status: "ignored" }).where(eq(whatsappMessages.id, messageId));
        return; // Human is handling this
      }

      if (!settings?.autoReplyEnabled) {
        await db.update(whatsappMessages).set({ status: "ignored" }).where(eq(whatsappMessages.id, messageId));
        return; // Auto reply disabled globally
      }

      // Fetch AI keys
      const keys = await db.query.projectApiKeys.findMany({ where: eq(projectApiKeys.projectId, claimedMsg.projectId) });
      const uKeys = await db.query.userApiKeys.findMany({ where: eq(userApiKeys.userId, project.userId) });
      const allKeys = [...keys, ...uKeys];

      // 4. Build Trusted Customer Context & Delegate to CoordinatorAgent -> BusinessAgent pipeline
      const userMessage = claimedMsg.content || "";
      const { CoordinatorAgent } = require("../../agents/coordinator");
      const coordinator = new CoordinatorAgent();

      const coordRes = await coordinator.execute({
        projectId: claimedMsg.projectId,
        sessionId: conversation.id,
        userId: "whatsapp_contact",
        customerContext: {
          phone: conversation.customerIdentifier,
          customerName: conversation.customerName || undefined,
          verified: true, // Identified phone channel
          isBusinessAdmin: false // Never elevated to business admin
        },
        payload: {
          message: userMessage,
          intent: userMessage
        }
      });

      let replyText = coordRes.data?.response || "";
      if (coordRes.data?.status === "PENDING_CONFIRMATION") {
        replyText = `Action confirmation required: Executing ${coordRes.data.toolExecuted || "action"} requires explicit user approval. Please reply CONFIRM to proceed.`;
      }

      // 6. Handle Handoff
      if (replyText === "HANDOFF_REQUIRED" || replyText.includes("HANDOFF_REQUIRED")) {
        // Trigger Handoff
        await db.update(whatsappConversations)
          .set({ status: "human_required", assignedMode: "human" })
          .where(eq(whatsappConversations.id, conversation.id));
        
        await db.insert(whatsappHandoffs).values({
          projectId: claimedMsg.projectId,
          conversationId: conversation.id,
          reason: "low_confidence_or_human_requested",
          status: "pending"
        });

        await db.update(whatsappMessages).set({ status: "ignored" }).where(eq(whatsappMessages.id, messageId));
        return;
      }

      // 7. Send Response
      const providerAdapter = providers[connection.provider];
      if (!providerAdapter) throw new Error("Unknown provider adapter");

      // Parse credentials securely
      let credentials = {};
      try {
        if (connection.encryptedCredentials) {
           const crypto = require("@workspace/db").crypto;
           credentials = JSON.parse(crypto.decrypt(connection.encryptedCredentials));
        }
      } catch (e) {}

      const sendResult = await providerAdapter.sendMessage({
        providerAccountId: connection.providerAccountId,
        providerChatId: conversation.providerChatId,
        customerIdentifier: conversation.customerIdentifier,
        text: replyText,
        credentials
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || "Failed to send provider message");
      }

      // 8. Store outbound message and finalize
      await db.insert(whatsappMessages).values({
        projectId: claimedMsg.projectId,
        conversationId: conversation.id,
        providerMessageId: sendResult.messageId || `out_${Date.now()}`,
        provider: connection.provider,
        direction: "outbound",
        sender: "ai",
        messageType: "text",
        content: replyText,
        aiGenerated: true,
        status: "sent"
      });

      await db.update(whatsappMessages).set({ status: "processed" }).where(eq(whatsappMessages.id, messageId));

      // 9. Analytics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Increment messagesReceived and aiReplies
      // Since no unique constraint is on (project_id, date), let's find First and Update
      const existingAnalytic = await db.query.whatsappAnalytics.findFirst({
        where: and(
          eq(whatsappAnalytics.projectId, claimedMsg.projectId),
          eq(whatsappAnalytics.date, today)
        )
      });
      if (existingAnalytic) {
        await db.update(whatsappAnalytics)
          .set({ 
            messagesReceived: sql`messages_received + 1`,
            aiReplies: sql`ai_replies + 1` 
          })
          .where(eq(whatsappAnalytics.id, existingAnalytic.id));
      } else {
        await db.insert(whatsappAnalytics).values({
          projectId: claimedMsg.projectId,
          date: today,
          messagesReceived: 1,
          aiReplies: 1
        });
      }

    } catch (err: any) {
      logger.error({ err, messageId }, "Failed to process WhatsApp message");
      // Fallback state
      await db.update(whatsappMessages)
        .set({ status: "failed", lastError: err.message })
        .where(eq(whatsappMessages.id, messageId));
    }
  }

  /**
   * Recovery mechanism for stuck messages
   */
  static async recoverPendingMessages(): Promise<void> {
    try {
      const now = new Date();
      // Find stuck messages
      const stuckMessages = await db.query.whatsappMessages.findMany({
        where: or(
          eq(whatsappMessages.status, "pending"),
          and(
             eq(whatsappMessages.status, "processing"),
             lte(whatsappMessages.leaseUntil, now)
          )
        ),
        limit: 50
      });

      for (const msg of stuckMessages) {
        // Fire and forget via Promise for concurrency
        this.processMessage(msg.id).catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, "WhatsApp Recovery Job Failed");
    }
  }
}
