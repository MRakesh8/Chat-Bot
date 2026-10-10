import { Router, Response } from "express";
import { isDemoProjectId } from "../../services/demo-project";
import { resolveAuthorizedProjectOrg } from "../../security";
import {
  createExecution,
  getProjectExecutions,
  getExecutionById,
  cancelExecution,
  retryExecution,
  approveExecution,
  ExecutionStatus,
} from "../../services/execution-governance";
import { logger } from "../../lib/logger";

const router = Router({ mergeParams: true });

/**
 * Demo project executions helper
 */
function getDemoExecutions() {
  const now = new Date().toISOString();
  return {
    executions: [
      {
        id: "demo-exec-1",
        projectId: "demo-project",
        organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9",
        agentType: "business_agent",
        title: "Website Catalog Analysis & Knowledge Indexing",
        status: "COMPLETED",
        inputPayload: { targetUrl: "https://demo.apex-dynamics.com", maxDepth: 2 },
        outputData: { indexedPages: 14, chunksGenerated: 48, status: "SUCCESS" },
        steps: [
          { name: "Crawl Homepage", status: "COMPLETED" },
          { name: "Extract Knowledge Chunks", status: "COMPLETED" },
          { name: "Generate Embeddings", status: "COMPLETED" },
        ],
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        startedAt: now,
        completedAt: now,
      },
      {
        id: "demo-exec-2",
        projectId: "demo-project",
        organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9",
        agentType: "tool_runner",
        title: "Shopify Order Status Lookup",
        status: "PENDING_APPROVAL",
        inputPayload: { actionName: "shopify_check_order", orderId: "#1094" },
        outputData: {},
        steps: [{ name: "Request User Approval for Write Action", status: "PENDING_APPROVAL" }],
        approvalToken: null,
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
      },
    ],
    totalCount: 2,
    runningCount: 0,
    pendingApprovalCount: 1,
    failedCount: 0,
    completedCount: 1,
  };
}

/**
 * GET /api/projects/:projectId/executions
 * Paginated list of agent execution runs.
 */
router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const statusFilter = (req.query.status as string) || "all";
  const agentType = req.query.agentType as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  if (isDemoProjectId(projectId)) {
    return res.json(getDemoExecutions());
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
    const data = await getProjectExecutions({
      projectId,
      organizationId: authoritativeOrgId,
      statusFilter: statusFilter as any,
      agentType,
      limit,
      offset,
    });

    return res.json(data);
  } catch (err: any) {
    logger.error({ err, projectId }, "Failed to fetch project executions");
    return res.status(500).json({ error: "Unable to fetch project executions. Please try again." });
  }
});

/**
 * GET /api/projects/:projectId/executions/stats
 * Quick run statistics endpoint.
 */
router.get("/stats", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;

  if (isDemoProjectId(projectId)) {
    const demo = getDemoExecutions();
    return res.json({
      totalCount: demo.totalCount,
      runningCount: demo.runningCount,
      pendingApprovalCount: demo.pendingApprovalCount,
      failedCount: demo.failedCount,
      completedCount: demo.completedCount,
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
    const data = await getProjectExecutions({
      projectId,
      organizationId: authoritativeOrgId,
      limit: 1,
    });

    return res.json({
      totalCount: data.totalCount,
      runningCount: data.runningCount,
      pendingApprovalCount: data.pendingApprovalCount,
      failedCount: data.failedCount,
      completedCount: data.completedCount,
    });
  } catch (err: any) {
    logger.error({ err, projectId }, "Failed to fetch execution stats");
    return res.status(500).json({ error: "Failed to fetch execution stats." });
  }
});

/**
 * GET /api/projects/:projectId/executions/:executionId
 * Execution run detail view by ID.
 */
router.get("/:executionId", async (req: any, res: Response): Promise<any> => {
  const { projectId, executionId } = req.params;

  if (isDemoProjectId(projectId)) {
    const demo = getDemoExecutions();
    const item = demo.executions.find((e) => e.id === executionId) || demo.executions[0];
    return res.json(item);
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
    const execution = await getExecutionById(projectId, authoritativeOrgId, executionId);

    if (!execution) {
      return res.status(404).json({ error: "Execution run not found or access denied" });
    }

    return res.json(execution);
  } catch (err: any) {
    logger.error({ err, projectId, executionId }, "Failed to fetch execution details");
    return res.status(500).json({ error: "Failed to fetch execution details." });
  }
});

/**
 * POST /api/projects/:projectId/executions
 * Trigger/register a new agent execution run.
 */
router.post("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const { title, agentType, inputPayload, status, approvalToken, maxRetries, steps } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  if (isDemoProjectId(projectId)) {
    const now = new Date().toISOString();
    return res.status(201).json({
      success: true,
      execution: {
        id: `demo-exec-${Date.now()}`,
        projectId: "demo-project",
        organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9",
        agentType: agentType || "business_agent",
        title: title ? String(title).slice(0, 150) : "Demo Execution",
        status: status || "RUNNING",
        inputPayload: inputPayload || {},
        outputData: {},
        steps: steps || [],
        retryCount: 0,
        maxRetries: maxRetries || 3,
        createdAt: now,
        startedAt: now,
      },
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
    const created = await createExecution({
      projectId,
      organizationId: authoritativeOrgId,
      userId: req.auth?.userId || null,
      agentType: agentType || "business_agent",
      title,
      status: status as ExecutionStatus,
      inputPayload,
      approvalToken,
      maxRetries,
      steps,
    });

    if (!created) {
      return res.status(500).json({ error: "Failed to register execution run." });
    }

    return res.status(201).json({ success: true, execution: created });
  } catch (err: any) {
    logger.error({ err, projectId }, "Failed to create execution");
    return res.status(500).json({ error: "Failed to create execution run." });
  }
});

/**
 * POST /api/projects/:projectId/executions/:executionId/cancel
 * Safely cancel an active or pending agent execution run.
 */
router.post("/:executionId/cancel", async (req: any, res: Response): Promise<any> => {
  const { projectId, executionId } = req.params;
  const { reason } = req.body || {};

  if (isDemoProjectId(projectId)) {
    const now = new Date().toISOString();
    return res.json({
      success: true,
      execution: {
        id: executionId,
        projectId,
        status: "CANCELLED",
        error: reason || "Cancelled in demo mode",
        completedAt: now,
        updatedAt: now,
      },
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
    const result = await cancelExecution(projectId, authoritativeOrgId, executionId, reason);

    if (!result.success) {
      return res.status(result.code || 400).json({ error: result.error, currentStatus: result.currentStatus });
    }

    return res.json({ success: true, execution: result.execution });
  } catch (err: any) {
    logger.error({ err, projectId, executionId }, "Failed to cancel execution");
    return res.status(500).json({ error: "Failed to cancel execution." });
  }
});

/**
 * POST /api/projects/:projectId/executions/:executionId/retry
 * Retry a failed or cancelled agent execution run.
 */
router.post("/:executionId/retry", async (req: any, res: Response): Promise<any> => {
  const { projectId, executionId } = req.params;

  if (isDemoProjectId(projectId)) {
    const now = new Date().toISOString();
    return res.json({
      success: true,
      execution: {
        id: executionId,
        projectId,
        status: "RUNNING",
        retryCount: 1,
        startedAt: now,
        updatedAt: now,
      },
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
    const result = await retryExecution(projectId, authoritativeOrgId, executionId);

    if (!result.success) {
      return res.status(result.code || 400).json({ error: result.error, currentStatus: result.currentStatus });
    }

    return res.json({ success: true, execution: result.execution });
  } catch (err: any) {
    logger.error({ err, projectId, executionId }, "Failed to retry execution");
    return res.status(500).json({ error: "Failed to retry execution." });
  }
});

/**
 * POST /api/projects/:projectId/executions/:executionId/approve
 * Approve an execution run currently in PENDING_APPROVAL status.
 */
router.post("/:executionId/approve", async (req: any, res: Response): Promise<any> => {
  const { projectId, executionId } = req.params;
  const { approvalToken } = req.body || {};

  if (isDemoProjectId(projectId)) {
    const now = new Date().toISOString();
    return res.json({
      success: true,
      execution: {
        id: executionId,
        projectId,
        status: "RUNNING",
        startedAt: now,
        updatedAt: now,
      },
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
    const result = await approveExecution(projectId, authoritativeOrgId, executionId, approvalToken);

    if (!result.success) {
      return res.status(result.code || 400).json({ error: result.error, currentStatus: result.currentStatus });
    }

    return res.json({ success: true, execution: result.execution });
  } catch (err: any) {
    logger.error({ err, projectId, executionId }, "Failed to approve execution");
    return res.status(500).json({ error: "Failed to approve execution." });
  }
});

export default router;
