import { Router, Response } from "express";
import { isDemoProjectId, getDemoNotifications } from "../../services/demo-project";
import { resolveAuthorizedProjectOrg } from "../../security";
import {
  getProjectNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearReadNotifications,
  getUnreadCount
} from "../../services/notifications";
import { withTenantContext } from "@workspace/db";
import { notificationSettings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router({ mergeParams: true });

/**
 * GET /api/projects/:projectId/notifications
 * List notifications with filtering (all, unread, leads, tools, feedback, system),
 * unread count, and settings.
 */
router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const filter = (req.query.filter as string) || "all";
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  if (isDemoProjectId(projectId)) {
    const demo = getDemoNotifications();
    const unread = demo.notifications.filter((n: any) => !n.readAt).length;
    return res.json({
      notifications: demo.notifications,
      totalCount: demo.notifications.length,
      unreadCount: unread,
      settings: { notifyOnDislikes: 3, notifyOnLikes: 3, enabled: true },
    });
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const data = await getProjectNotifications({
      projectId,
      organizationId: authoritativeOrgId,
      filter: filter as any,
      limit,
      offset,
    });

    return res.json(data);
  } catch (err: any) {
    req.log?.error?.({ err, projectId }, "Failed to fetch notifications");
    return res.status(500).json({ error: "Unable to fetch notifications. Please try again." });
  }
});

/**
 * GET /api/projects/:projectId/notifications/unread-count
 * Fast endpoint for header badges.
 */
router.get("/unread-count", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;

  if (isDemoProjectId(projectId)) {
    const demo = getDemoNotifications();
    const unreadCount = demo.notifications.filter((n: any) => !n.readAt).length;
    return res.json({ unreadCount });
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const unreadCount = await getUnreadCount(projectId, authoritativeOrgId);
    return res.json({ unreadCount });
  } catch (err: any) {
    req.log?.error?.({ err, projectId }, "Failed to fetch unread count");
    return res.status(500).json({ error: "Failed to fetch unread count." });
  }
});

/**
 * PATCH /api/projects/:projectId/notifications/:notificationId/read
 * Mark a single notification as read.
 */
router.patch("/:notificationId/read", async (req: any, res: Response): Promise<any> => {
  const { projectId, notificationId } = req.params;
  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const updated = await markNotificationAsRead(projectId, authoritativeOrgId, notificationId);
    if (!updated) {
      return res.status(404).json({ error: "Notification not found or access denied" });
    }

    return res.json({ success: true, notification: updated });
  } catch (err: any) {
    req.log?.error?.({ err, projectId, notificationId }, "Failed to mark notification as read");
    return res.status(500).json({ error: "Failed to mark notification as read." });
  }
});

/**
 * POST /api/projects/:projectId/notifications/read-all
 * Mark all notifications for the project as read.
 */
router.post("/read-all", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const result = await markAllNotificationsAsRead(projectId, authoritativeOrgId);
    return res.json({ success: true, markedCount: result.count });
  } catch (err: any) {
    req.log?.error?.({ err, projectId }, "Failed to mark all notifications as read");
    return res.status(500).json({ error: "Failed to mark all notifications as read." });
  }
});

/**
 * DELETE /api/projects/:projectId/notifications/:notificationId
 * Delete a specific notification.
 */
router.delete("/:notificationId", async (req: any, res: Response): Promise<any> => {
  const { projectId, notificationId } = req.params;
  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const deleted = await deleteNotification(projectId, authoritativeOrgId, notificationId);
    if (!deleted) {
      return res.status(404).json({ error: "Notification not found or access denied" });
    }

    return res.json({ success: true, deletedId: deleted.id });
  } catch (err: any) {
    req.log?.error?.({ err, projectId, notificationId }, "Failed to delete notification");
    return res.status(500).json({ error: "Failed to delete notification." });
  }
});

/**
 * DELETE /api/projects/:projectId/notifications/clear-read
 * Delete all read notifications for this project.
 */
router.delete("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const result = await clearReadNotifications(projectId, authoritativeOrgId);
    return res.json({ success: true, clearedCount: result.count });
  } catch (err: any) {
    req.log?.error?.({ err, projectId }, "Failed to clear read notifications");
    return res.status(500).json({ error: "Failed to clear read notifications." });
  }
});

/**
 * GET /api/projects/:projectId/notifications/settings
 * Fetch notification settings for the project.
 */
router.get("/settings", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;
    const settings = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.projectId, projectId));
      return existing || { projectId, notifyOnDislikes: 3, notifyOnLikes: 3, enabled: true };
    });

    return res.json(settings);
  } catch (err: any) {
    req.log?.error?.({ err, projectId }, "Failed to fetch notification settings");
    return res.status(500).json({ error: "Failed to fetch notification settings." });
  }
});

/**
 * POST /api/projects/:projectId/notifications/settings
 * Save notification settings for the project.
 */
router.post("/settings", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const { notifyOnDislikes, notifyOnLikes, enabled } = req.body;
  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;

    const safeDislikes = typeof notifyOnDislikes === "number" ? Math.max(1, Math.min(100, notifyOnDislikes)) : 3;
    const safeLikes = typeof notifyOnLikes === "number" ? Math.max(1, Math.min(100, notifyOnLikes)) : 3;
    const safeEnabled = typeof enabled === "boolean" ? enabled : true;

    await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const [existing] = await tx.select().from(notificationSettings).where(eq(notificationSettings.projectId, projectId));
      if (existing) {
        await tx.update(notificationSettings)
          .set({ notifyOnDislikes: safeDislikes, notifyOnLikes: safeLikes, enabled: safeEnabled, updatedAt: new Date() })
          .where(eq(notificationSettings.projectId, projectId));
      } else {
        await tx.insert(notificationSettings).values({
          projectId,
          notifyOnDislikes: safeDislikes,
          notifyOnLikes: safeLikes,
          enabled: safeEnabled
        });
      }
    });

    return res.json({ success: true, settings: { projectId, notifyOnDislikes: safeDislikes, notifyOnLikes: safeLikes, enabled: safeEnabled } });
  } catch (err: any) {
    req.log?.error?.({ err, projectId }, "Failed to update notification settings");
    return res.status(500).json({ error: "Failed to update notification settings." });
  }
});

export default router;
