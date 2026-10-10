import { Router, Request, Response } from "express";
import { BusinessAgent } from "../../agents/businessAgent";
import { checkProjectEntitlement } from "../../security/entitlement";
import { logSecurityEvent } from "../../security/middleware";
import { logger } from "../../lib/logger";
import { db, projects, organizationMembers } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();
const businessAgent = new BusinessAgent();

async function userHasAccessToProject(userId: string, projectId: string, dbUserRole?: string, memberships?: any[]) {
  if (dbUserRole === "super_admin" || dbUserRole === "admin") {
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
    return Boolean(p);
  }

  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) return false;

  if (p.userId === userId) return true;

  if (p.organizationId) {
    if (memberships && memberships.some((m) => m.organizationId === p.organizationId)) {
      return true;
    }
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, p.organizationId), eq(organizationMembers.userId, userId)))
      .limit(1);
    if (membership) return true;
  }

  return false;
}

// GET /api/agent/capabilities/:projectId
router.get("/capabilities/:projectId", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const projectId = req.params.projectId as string;
    const hasAccess = await userHasAccessToProject(
      userId,
      projectId,
      (req as any).auth?.dbUser?.role,
      (req as any).auth?.memberships
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Forbidden: You do not have access to this project" });
    }

    const capabilities = await businessAgent.getProjectCapabilities(projectId);
    return res.json({ success: true, capabilities });
  } catch (err: any) {
    logger.error({ err }, "Error fetching agent capabilities");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/agent/process
router.post("/process", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { projectId, sessionId, message, confirmationToken, actionId } = req.body;
    if (!projectId || (!message && !confirmationToken)) {
      return res.status(400).json({ error: "Missing required fields: projectId and message or confirmationToken" });
    }

    const hasAccess = await userHasAccessToProject(
      userId,
      projectId,
      (req as any).auth?.dbUser?.role,
      (req as any).auth?.memberships
    );

    if (!hasAccess) {
      await logSecurityEvent({
        eventName: "AGENT_UNAUTHORIZED_ACCESS",
        req,
        projectId,
        details: { message: "User attempted to run agent on unauthorized project" },
      });
      return res.status(403).json({ error: "Forbidden: You do not have access to this project" });
    }

    // Entitlement Check
    const entitlement = await checkProjectEntitlement(projectId);
    if (!entitlement.allowed) {
      return res.status(403).json({
        error: entitlement.message || "Your trial or subscription has expired. Please upgrade.",
        status: entitlement.status,
      });
    }

    // Create persistent execution record
    const { createExecution, updateExecutionProgress } = await import("../../services/execution-governance");
    const execRecord = await createExecution({
      projectId,
      userId,
      sessionId,
      agentType: "business_agent",
      title: message ? `Process Message: ${message.slice(0, 50)}` : "Execute Business Agent Action",
      status: "RUNNING",
      inputPayload: { message, confirmationToken, actionId },
    });

    const result = await businessAgent.execute({
      projectId,
      userId,
      sessionId,
      payload: {
        message,
        confirmationToken,
        actionId,
      },
    });

    if (execRecord && execRecord.organizationId) {
      const resAny = result as any;
      const finalStatus = resAny.status === "PENDING_CONFIRMATION" ? "PENDING_APPROVAL" : (result.success ? "COMPLETED" : "FAILED");
      await updateExecutionProgress(projectId, execRecord.organizationId, execRecord.id, {
        status: finalStatus,
        outputData: result.data || { response: resAny.response },
        error: result.error || null,
        steps: resAny.steps || [],
      });
    }

    return res.json(result);
  } catch (err: any) {
    logger.error({ err, reqId: req.id }, "Error processing agent request");
    return res.status(500).json({ error: "Internal server error", errorId: req.id });
  }
});

export default router;
