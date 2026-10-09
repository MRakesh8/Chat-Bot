import { db, withTenantContext } from "@workspace/db";
import { notifications, notificationSettings, projects } from "@workspace/db/schema";
import { eq, and, desc, isNull, inArray, sql, count } from "drizzle-orm";
import { activityBus, sanitizeActivityText } from "./activity";
import { logger } from "../lib/logger";

export type NotificationType =
  | "LEAD_CAPTURED"
  | "TOOL_FAILED"
  | "TOOL_SUCCESS"
  | "SECURITY_ALERT"
  | "SUGGESTION"
  | "QUALITY_ALERT"
  | "SYSTEM_ALERT"
  | "INTEGRATION_ALERT"
  | "CHAT_HANDOFF";

export type NotificationSeverity = "info" | "warning" | "error" | "success" | "critical" | "high" | "medium" | "low";

export interface CreateNotificationParams {
  projectId: string;
  organizationId?: string;
  type: NotificationType | string;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  referenceId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, any>;
}

export interface GetNotificationsOptions {
  projectId: string;
  organizationId: string;
  filter?: "all" | "unread" | "leads" | "tools" | "feedback" | "system";
  limit?: number;
  offset?: number;
}

/**
 * Creates a validated, sanitized notification and broadcasts it via activity bus.
 * Prevents duplicates when a dedupeKey is provided.
 */
export async function createNotification(params: CreateNotificationParams) {
  const { projectId, type, title, message, referenceId, dedupeKey } = params;
  const severity = params.severity || "info";

  try {
    // 1. Resolve organization ID if not provided
    let finalOrgId = params.organizationId;
    if (!finalOrgId) {
      const [proj] = await db
        .select({ organizationId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, projectId));
      if (!proj || !proj.organizationId) {
        logger.warn({ projectId }, "Cannot create notification: project not found or missing organizationId");
        return null;
      }
      finalOrgId = proj.organizationId;
    }

    // 2. Check project notification settings (if disabled, skip)
    const [settings] = await db
      .select({ enabled: notificationSettings.enabled })
      .from(notificationSettings)
      .where(eq(notificationSettings.projectId, projectId));

    if (settings && settings.enabled === false) {
      logger.info({ projectId, type }, "Skipping notification: notifications disabled in settings");
      return null;
    }

    // 3. Deduplication check
    if (dedupeKey) {
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.projectId, projectId), eq(notifications.dedupeKey, dedupeKey)))
        .limit(1);

      if (existing) {
        logger.info({ projectId, dedupeKey }, "Notification deduplicated; skipped insert");
        return null;
      }
    }

    // 4. Sanitize title and message to prevent any credentials or internal traces from leaking
    const cleanTitle = sanitizeActivityText(title, 120);
    const cleanMessage = sanitizeActivityText(message, 500);

    // 5. Insert notification record
    const [created] = await db
      .insert(notifications)
      .values({
        organizationId: finalOrgId,
        projectId,
        type,
        severity,
        title: cleanTitle,
        message: cleanMessage,
        referenceId: referenceId || null,
        dedupeKey: dedupeKey || null,
        createdAt: new Date(),
      })
      .returning();

    // 6. Broadcast event via activityBus for live UI updates
    try {
      activityBus.emitEvent({
        id: `notif-${created.id}`,
        type: type === "LEAD_CAPTURED" ? "lead" : type.includes("TOOL") ? "tool_execution" : "security",
        title: cleanTitle,
        detail: cleanMessage,
        status: severity,
        timestamp: created.createdAt instanceof Date ? created.createdAt.toISOString() : String(created.createdAt || new Date().toISOString()),
        projectId,
        organizationId: finalOrgId,
        metadata: {
          notificationId: created.id,
          notificationType: type,
          severity,
          referenceId,
          ...params.metadata,
        },
      });
    } catch (busErr) {
      logger.error({ busErr }, "Failed to emit notification to activityBus");
    }

    return created;
  } catch (err: any) {
    logger.error({ err, projectId, type }, "Failed to create notification");
    return null;
  }
}

/**
 * Retrieve notifications for a project with strict tenant isolation,
 * flexible filtering, pagination, and unread counts.
 */
export async function getProjectNotifications(options: GetNotificationsOptions) {
  const { projectId, organizationId, filter = "all", limit = 50, offset = 0 } = options;
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeOffset = Math.max(0, offset);

  return await withTenantContext(organizationId, async (tx: any) => {
    // Verify project belongs to organization
    const [proj] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));

    if (!proj) {
      throw new Error("Project not found or access denied");
    }

    // Determine query conditions based on filter
    const conditions = [eq(notifications.projectId, projectId)];

    if (filter === "unread") {
      conditions.push(isNull(notifications.readAt));
    } else if (filter === "leads") {
      conditions.push(inArray(notifications.type, ["LEAD_CAPTURED", "lead"]));
    } else if (filter === "tools") {
      conditions.push(inArray(notifications.type, ["TOOL_FAILED", "TOOL_SUCCESS", "SECURITY_ALERT", "tool_execution"]));
    } else if (filter === "feedback") {
      conditions.push(inArray(notifications.type, ["SUGGESTION", "QUALITY_ALERT", "feedback"]));
    } else if (filter === "system") {
      conditions.push(inArray(notifications.type, ["SYSTEM_ALERT", "INTEGRATION_ALERT", "system"]));
    }

    // Fetch notifications list
    const items = await tx
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

    // Fetch total and unread counts for this project
    const [unreadRes] = await tx
      .select({ unreadCount: count() })
      .from(notifications)
      .where(and(eq(notifications.projectId, projectId), isNull(notifications.readAt)));

    const [totalRes] = await tx
      .select({ totalCount: count() })
      .from(notifications)
      .where(eq(notifications.projectId, projectId));

    // Fetch project notification settings
    const [settings] = await tx
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.projectId, projectId));

    return {
      notifications: items,
      totalCount: Number(totalRes?.totalCount || 0),
      unreadCount: Number(unreadRes?.unreadCount || 0),
      settings: settings || { notifyOnDislikes: 3, notifyOnLikes: 3, enabled: true },
    };
  });
}

/**
 * Mark a specific notification as read.
 */
export async function markNotificationAsRead(projectId: string, organizationId: string, notificationId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [updated] = await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.projectId, projectId)))
      .returning();
    return updated || null;
  });
}

/**
 * Mark all unread notifications for a project as read.
 */
export async function markAllNotificationsAsRead(projectId: string, organizationId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const updated = await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.projectId, projectId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return { count: updated.length };
  });
}

/**
 * Delete a specific notification.
 */
export async function deleteNotification(projectId: string, organizationId: string, notificationId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [deleted] = await tx
      .delete(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.projectId, projectId)))
      .returning({ id: notifications.id });
    return deleted || null;
  });
}

/**
 * Delete all read notifications for a project.
 */
export async function clearReadNotifications(projectId: string, organizationId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const deleted = await tx
      .delete(notifications)
      .where(and(eq(notifications.projectId, projectId), sql`${notifications.readAt} IS NOT NULL`))
      .returning({ id: notifications.id });
    return { count: deleted.length };
  });
}

/**
 * Get quick unread count for badge indicators.
 */
export async function getUnreadCount(projectId: string, organizationId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [res] = await tx
      .select({ unreadCount: count() })
      .from(notifications)
      .where(and(eq(notifications.projectId, projectId), isNull(notifications.readAt)));
    return Number(res?.unreadCount || 0);
  });
}
