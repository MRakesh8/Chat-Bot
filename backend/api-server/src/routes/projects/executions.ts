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
export function getDemoExecutions(filters?: { status?: string; search?: string; agentType?: string }) {
  const now = new Date().toISOString();
  const allExecutions = [
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
        {
          stepId: "step_1",
          name: "crawl_page",
          actionType: "crawl_page",
          description: "Crawl Homepage and extract structure",
          riskLevel: "READ_ONLY",
          status: "COMPLETED",
          durationMs: 420,
          verification: {
            verified: true,
            status: "SUCCEEDED",
            evidence: { recordsCount: 1, entityId: "page_home" },
            reason: "Successfully parsed homepage DOM tree",
          },
        },
        {
          stepId: "step_2",
          name: "extract_chunks",
          actionType: "extract_chunks",
          description: "Extract clean semantic knowledge chunks",
          dependsOn: ["step_1"],
          riskLevel: "READ_ONLY",
          status: "COMPLETED",
          durationMs: 680,
          verification: {
            verified: true,
            status: "SUCCEEDED",
            evidence: { recordsCount: 48 },
            reason: "Generated 48 chunks with verified tokens",
          },
        },
        {
          stepId: "step_3",
          name: "generate_embeddings",
          actionType: "generate_embeddings",
          description: "Vectorize chunks and upsert to index",
          dependsOn: ["step_2"],
          riskLevel: "LOW_RISK_WRITE",
          status: "COMPLETED",
          durationMs: 1150,
          verification: {
            verified: true,
            status: "SUCCEEDED",
            evidence: { recordsCount: 48, entityId: "kb_index_ready" },
            reason: "Indexed 48 vectors into knowledge store",
          },
        },
      ],
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      completedAt: new Date(Date.now() - 3597750).toISOString(),
    },
    {
      id: "demo-exec-2",
      projectId: "demo-project",
      organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9",
      agentType: "business_agent",
      title: "Cancel Shopify Order #1094",
      status: "PENDING_APPROVAL",
      inputPayload: { actionName: "shopify_cancel_order", orderId: "#1094" },
      outputData: {
        stepToConfirm: {
          stepId: "step_1",
          actionType: "shopify_cancel_order",
          description: "Cancel store order #1094",
          input: { orderId: "#1094" },
          riskLevel: "HIGH_RISK_WRITE",
        },
        confirmationToken: "demo_approval_token_shopify_cancel_1094",
        expiresAt: new Date(Date.now() + 240000).toISOString(),
        response: "Approval Required: Step 'Cancel store order #1094' is classified as HIGH_RISK_WRITE risk. Please confirm to proceed.",
      },
      steps: [
        {
          stepId: "step_1",
          name: "shopify_cancel_order",
          actionType: "shopify_cancel_order",
          description: "Cancel store order #1094",
          input: { orderId: "#1094" },
          riskLevel: "HIGH_RISK_WRITE",
          requiresConfirmation: true,
          status: "PENDING_APPROVAL",
          detail: "Awaiting operator authorization before permanent cancellation.",
        },
      ],
      approvalToken: "demo_approval_token_shopify_cancel_1094",
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(Date.now() - 600000).toISOString(),
      startedAt: new Date(Date.now() - 600000).toISOString(),
    },
    {
      id: "demo-exec-3",
      projectId: "demo-project",
      organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9",
      agentType: "business_agent",
      title: "Bulk Price Adjustment - Winter Sale",
      status: "FAILED",
      inputPayload: { actionName: "shopify_bulk_update_prices", discountPercent: 20 },
      outputData: {},
      error: "Rate limit exceeded on Shopify Admin API (HTTP 429). Retry quota exhausted.",
      steps: [
        {
          stepId: "step_1",
          name: "shopify_get_products",
          actionType: "shopify_get_products",
          description: "Fetch product catalog",
          riskLevel: "READ_ONLY",
          status: "COMPLETED",
          durationMs: 310,
          verification: {
            verified: true,
            status: "SUCCEEDED",
            evidence: { recordsCount: 15 },
          },
        },
        {
          stepId: "step_2",
          name: "shopify_update_product",
          actionType: "shopify_update_product",
          description: "Update product prices in bulk",
          dependsOn: ["step_1"],
          riskLevel: "LOW_RISK_WRITE",
          status: "FAILED",
          error: "HTTP 429: Too Many Requests from Shopify API gateway",
          verification: {
            verified: false,
            status: "FAILED",
            reason: "Provider returned rate limit error",
          },
        },
      ],
      retryCount: 1,
      maxRetries: 3,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      completedAt: new Date(Date.now() - 7198000).toISOString(),
    },
  ];

  let filtered = allExecutions;
  if (filters?.status && filters.status !== "all") {
    filtered = filtered.filter((e) => e.status === filters.status);
  }
  if (filters?.agentType && filters.agentType !== "ALL") {
    filtered = filtered.filter((e) => e.agentType === filters.agentType);
  }
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((e) => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }

  return {
    executions: filtered,
    totalCount: allExecutions.length,
    runningCount: allExecutions.filter((e) => e.status === "RUNNING").length,
    pendingApprovalCount: allExecutions.filter((e) => e.status === "PENDING_APPROVAL").length,
    failedCount: allExecutions.filter((e) => e.status === "FAILED").length,
    completedCount: allExecutions.filter((e) => e.status === "COMPLETED").length,
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
  const searchQuery = (req.query.search as string) || (req.query.searchQuery as string);
  const toolName = req.query.tool as string;
  const fromDate = req.query.fromDate as string;
  const toDate = req.query.toDate as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  if (isDemoProjectId(projectId)) {
    return res.json(getDemoExecutions({ status: statusFilter, search: searchQuery, agentType }));
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
      searchQuery,
      toolName,
      fromDate,
      toDate,
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
