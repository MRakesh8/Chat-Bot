import { Router, Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { 
  projects,
  notifications,
  notificationSettings
} from "@workspace/db/schema";
import { withTenantContext } from "@workspace/db";
import { isDemoProjectId, getDemoNotifications } from "../../services/demo-project";

const router = Router({ mergeParams: true });

router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    return res.json(getDemoNotifications());
  }
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  
  if (!orgId || Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });
  
  const auth = req.auth;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const isSuperAdmin = auth.dbUser?.role === "super_admin";
  const membership = auth.memberships?.find((m: any) => m.organizationId === orgId);
  if (!isSuperAdmin && !membership) return res.status(403).json({ error: "Forbidden" });

  try {
    const data = await withTenantContext(orgId as string, async (tx: any) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
      if (!project) throw new Error("Project not found");

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
    if (err.message === "Project not found") return res.status(404).json({ error: "Project not found" });
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/:notificationId/read", async (req: any, res: Response): Promise<any> => {
  const { projectId, notificationId } = req.params;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  
  if (!orgId || Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });
  
  const auth = req.auth;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const isSuperAdmin = auth.dbUser?.role === "super_admin";
  const membership = auth.memberships?.find((m: any) => m.organizationId === orgId);
  if (!isSuperAdmin && !membership) return res.status(403).json({ error: "Forbidden" });

  try {
    await withTenantContext(orgId as string, async (tx: any) => {
      await tx.update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.projectId, projectId)));
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.post("/settings", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const { notifyOnDislikes, notifyOnLikes, enabled } = req.body;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  
  if (!orgId || Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });
  
  const auth = req.auth;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const isSuperAdmin = auth.dbUser?.role === "super_admin";
  const membership = auth.memberships?.find((m: any) => m.organizationId === orgId);
  if (!isSuperAdmin && !membership) return res.status(403).json({ error: "Forbidden" });

  try {
    await withTenantContext(orgId as string, async (tx: any) => {
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
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
