import { Router, Response } from "express";
import { db, withTenantContext } from "@workspace/db";
import { projects, notifications, organizationMembers } from "@workspace/db/schema";
import { eq, and, desc, isNull, inArray } from "drizzle-orm";
import { resolveAuthorizedOrgForUser } from "../../security/org-resolution";

const router = Router();

/**
 * GET /api/notifications/unread-summary
 * Get total unread notifications count for the authenticated user across their active projects.
 */
router.get("/unread-summary", async (req: any, res: Response): Promise<any> => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
    if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

    const orgResolution = await resolveAuthorizedOrgForUser(req, rawOrgId);
    if (!orgResolution) {
      return res.status(403).json({ error: "Forbidden: No authorized organization found" });
    }

    const { authoritativeOrgId } = orgResolution;

    const summary = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      // Find all projects belonging to this organization
      const userProjects = await tx
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.organizationId, authoritativeOrgId));

      if (userProjects.length === 0) {
        return { totalUnread: 0, byProject: {} };
      }

      const projectIds = userProjects.map((p: any) => p.id);

      const unreadNotifs = await tx
        .select({
          id: notifications.id,
          projectId: notifications.projectId,
          severity: notifications.severity,
          title: notifications.title,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, authoritativeOrgId),
            inArray(notifications.projectId, projectIds),
            isNull(notifications.readAt)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(20);

      const byProject: Record<string, number> = {};
      for (const p of userProjects) {
        byProject[p.id] = 0;
      }

      for (const notif of unreadNotifs) {
        byProject[notif.projectId] = (byProject[notif.projectId] || 0) + 1;
      }

      return {
        totalUnread: unreadNotifs.length,
        recentUnread: unreadNotifs,
        byProject,
      };
    });

    return res.json(summary);
  } catch (err: any) {
    req.log?.error?.({ err, userId }, "Failed to get user notifications summary");
    return res.status(500).json({ error: "Failed to load notifications summary." });
  }
});

export default router;
