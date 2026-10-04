import { Router, Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { 
  projects,
  notifications,
  notificationSettings
} from "@workspace/db/schema";
import { withTenantContext } from "@workspace/db";
import { isDemoProjectId, getDemoNotifications } from "../../services/demo-project";
import { resolveAuthorizedProjectOrg } from "../../security";

const router = Router({ mergeParams: true });

router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    return res.json(getDemoNotifications());
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

    const data = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const notifs = await tx.select()
        .from(notifications)
        .where(eq(notifications.projectId, projectId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
        
      const [settings] = await tx.select().from(notificationSettings).where(eq(notificationSettings.projectId, projectId));
      
      return { notifications: notifs, settings: settings || { notifyOnDislikes: 3, notifyOnLikes: 3, enabled: true } };
    });
    return res.json(data);
  } catch (err: any) {
    req.log.error({ err, projectId }, "Failed to fetch notifications");
    return res.status(500).json({ error: "Unable to fetch notifications. Please try again." });
  }
});

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

    await withTenantContext(authoritativeOrgId, async (tx: any) => {
      await tx.update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.projectId, projectId)));
    });
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err, projectId, notificationId }, "Failed to mark notification as read");
    return res.status(500).json({ error: "Failed to mark notification as read." });
  }
});

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

    await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const [existing] = await tx.select().from(notificationSettings).where(eq(notificationSettings.projectId, projectId));
      if (existing) {
        await tx.update(notificationSettings)
          .set({ notifyOnDislikes, notifyOnLikes, enabled, updatedAt: new Date() })
          .where(eq(notificationSettings.projectId, projectId));
      } else {
        await tx.insert(notificationSettings).values({ projectId, notifyOnDislikes, notifyOnLikes, enabled });
      }
    });
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err, projectId }, "Failed to update notification settings");
    return res.status(500).json({ error: "Failed to update notification settings." });
  }
});

export default router;
