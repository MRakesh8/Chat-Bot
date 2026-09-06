import { Router, Response } from "express";
import { db } from "../../lib/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { 
  projects,
  messageFeedback,
  projectFeedback
} from "@workspace/db/schema";
import { withTenantContext } from "@workspace/db";

const router = Router({ mergeParams: true });

router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;

  if (!orgId || Array.isArray(orgId)) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const isSuperAdmin = auth.dbUser?.role === "super_admin";
  const membership = auth.memberships?.find((m: any) => m.organizationId === orgId);
  
  if (!isSuperAdmin && !membership) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const feedbackData = await withTenantContext(orgId as string, async (tx: any) => {
      // Validate project exists
      const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
      if (!project) throw new Error("Project not found");

      // Aggregate Message Feedback
      const [{ likes }] = await tx.select({ likes: sql<number>`count(${messageFeedback.id})`.mapWith(Number) })
        .from(messageFeedback).where(and(eq(messageFeedback.projectId, projectId), eq(messageFeedback.type, "LIKE")));
        
      const [{ dislikes }] = await tx.select({ dislikes: sql<number>`count(${messageFeedback.id})`.mapWith(Number) })
        .from(messageFeedback).where(and(eq(messageFeedback.projectId, projectId), eq(messageFeedback.type, "DISLIKE")));

      // Recent Message Feedback
      const recentMessageFeedback = await tx.select()
        .from(messageFeedback)
        .where(eq(messageFeedback.projectId, projectId))
        .orderBy(desc(messageFeedback.createdAt))
        .limit(10);

      // Recent Project Feedback
      const recentProjectFeedback = await tx.select()
        .from(projectFeedback)
        .where(eq(projectFeedback.projectId, projectId))
        .orderBy(desc(projectFeedback.createdAt))
        .limit(10);

      return {
        aggregate: {
          likes,
          dislikes,
          total: likes + dislikes,
          likeRate: likes + dislikes > 0 ? (likes / (likes + dislikes)) * 100 : 0,
          dislikeRate: likes + dislikes > 0 ? (dislikes / (likes + dislikes)) * 100 : 0
        },
        recentMessageFeedback,
        recentProjectFeedback
      };
    });

    return res.json(feedbackData);
  } catch (err: any) {
    if (err.message === "Project not found") return res.status(404).json({ error: "Project not found" });
    req.log.error(err, "Error fetching feedback");
    return res.status(500).json({ error: "Error fetching feedback" });
  }
});

export default router;
