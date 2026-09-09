import { db } from "@workspace/db";
import { 
  projects,
  messageFeedback, 
  projectFeedback, 
  notifications, 
  notificationSettings, 
  messages, 
  chatSessions 
} from "@workspace/db/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

export async function submitMessageFeedback(params: {
  projectId: string;
  sessionId: string;
  messageId: string;
  customerId?: string;
  type: "LIKE" | "DISLIKE";
  comment?: string;
  channel: string;
}) {
  // 1. Validate message belongs to session
  const [msg] = await db.select({
    id: messages.id,
    sender: messages.sender,
    sessionId: messages.sessionId
  })
  .from(messages)
  .where(and(eq(messages.id, params.messageId), eq(messages.sessionId, params.sessionId)));

  if (!msg) throw new Error("Message not found or does not belong to session");
  if (msg.sender !== "assistant") throw new Error("Feedback only allowed on assistant messages");

  // Verify session belongs to project
  const [sess] = await db.select({ projectId: chatSessions.projectId }).from(chatSessions).where(eq(chatSessions.id, params.sessionId));
  if (!sess || sess.projectId !== params.projectId) throw new Error("Session does not belong to project");

  // 2. Check for existing feedback
  const [existing] = await db.select()
    .from(messageFeedback)
    .where(and(eq(messageFeedback.messageId, params.messageId), eq(messageFeedback.projectId, params.projectId)));

  if (existing) {
    if (existing.type === params.type && existing.comment === params.comment) {
      return existing; // idempotent
    }
    // Update
    await db.update(messageFeedback)
      .set({ type: params.type, comment: params.comment, createdAt: new Date() })
      .where(eq(messageFeedback.id, existing.id));
  } else {
    // Insert
    await db.insert(messageFeedback).values({
      projectId: params.projectId,
      sessionId: params.sessionId,
      messageId: params.messageId,
      customerId: params.customerId || null,
      type: params.type,
      comment: params.comment,
      channel: params.channel
    });
  }

  // 3. Process threshold notifications asynchronously
  processNotificationThresholds(params.projectId, params.type).catch(e => logger.error(e, "Threshold error"));

  return { success: true };
}

export async function submitProjectFeedback(params: {
  projectId: string;
  customerId?: string;
  category?: string;
  rating?: number;
  comment: string;
  channel: string;
}) {
  await db.insert(projectFeedback).values({
    projectId: params.projectId,
    customerId: params.customerId || null,
    category: params.category || "Other",
    rating: params.rating,
    comment: params.comment,
    channel: params.channel
  });
  
  return { success: true };
}

async function processNotificationThresholds(projectId: string, type: "LIKE" | "DISLIKE") {
  // Check settings
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.projectId, projectId));
  if (!settings || !settings.enabled) return;

  // Get counts within last 24h
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const [{ fbCount }] = await db.select({
    fbCount: sql<number>`count(${messageFeedback.id})`.mapWith(Number)
  })
  .from(messageFeedback)
  .where(and(
    eq(messageFeedback.projectId, projectId),
    eq(messageFeedback.type, type),
    gte(messageFeedback.createdAt, yesterday)
  ));

  const threshold = type === "LIKE" ? settings.notifyOnLikes : settings.notifyOnDislikes;
  
  if (threshold > 0 && fbCount > 0 && fbCount % threshold === 0) {
    // Determine dedupe key based on count block
    const block = Math.floor(fbCount / threshold);
    const dedupeKey = `threshold_${projectId}_${type}_24h_b${block}`;
    
    const [org] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
    if (!org) return;

    // We can't easily onConflictDoNothing with an index on just dedupeKey unless we make it unique.
    // Instead we query first to prevent dupes.
    const [existing] = await db.select().from(notifications).where(eq(notifications.dedupeKey, dedupeKey));
    if (existing) return;

    await db.insert(notifications).values({
      organizationId: org.organizationId as string,
      projectId,
      type: "QUALITY_ALERT",
      severity: type === "DISLIKE" ? "high" : "low",
      title: `${type === "DISLIKE" ? "Negative" : "Positive"} feedback threshold reached`,
      message: `Received ${fbCount} ${type.toLowerCase()}s in the last 24 hours.`,
      dedupeKey
    });
  }
}
