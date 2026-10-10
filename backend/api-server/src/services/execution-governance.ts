import { db, withTenantContext, agentExecutions, projects } from "@workspace/db";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { activityBus, sanitizeActivityText } from "./activity";
import { logger } from "../lib/logger";

export type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "PENDING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface CreateExecutionParams {
  projectId: string;
  organizationId?: string;
  userId?: string | null;
  sessionId?: string | null;
  agentType?: string;
  title: string;
  status?: ExecutionStatus;
  inputPayload?: Record<string, any>;
  approvalToken?: string | null;
  maxRetries?: number;
  steps?: any[];
}

export interface GetExecutionsOptions {
  projectId: string;
  organizationId: string;
  statusFilter?: ExecutionStatus | "all";
  agentType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Deeply sanitizes objects/arrays to redact API keys, Bearer tokens, passwords, and secrets.
 */
export function sanitizePayload(payload: any): any {
  if (typeof payload === "string") {
    return sanitizeActivityText(payload);
  }
  if (Array.isArray(payload)) {
    return payload.map(sanitizePayload);
  }
  if (payload !== null && typeof payload === "object") {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("key") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("auth")
      ) {
        if (typeof value === "string" && value.length > 0) {
          clean[key] = "[REDACTED_SECRET]";
        } else {
          clean[key] = sanitizePayload(value);
        }
      } else {
        clean[key] = sanitizePayload(value);
      }
    }
    return clean;
  }
  return payload;
}

/**
 * Creates a persistent agent execution record, sanitizes inputs, and emits a real-time event.
 */
export async function createExecution(params: CreateExecutionParams) {
  const {
    projectId,
    userId,
    sessionId,
    agentType = "business_agent",
    title,
    status = "PENDING",
    inputPayload = {},
    approvalToken = null,
    maxRetries = 3,
    steps = [],
  } = params;

  try {
    // 1. Resolve organization ID if not provided
    let finalOrgId = params.organizationId;
    if (!finalOrgId) {
      const [proj] = await db
        .select({ organizationId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!proj || !proj.organizationId) {
        logger.warn({ projectId }, "Cannot create execution: project not found or missing organizationId");
        return null;
      }
      finalOrgId = proj.organizationId;
    }

    // 2. Sanitize title and input payload
    const cleanTitle = sanitizeActivityText(title, 150);
    const cleanPayload = sanitizePayload(inputPayload);
    const cleanSteps = sanitizePayload(steps);
    const now = new Date();

    // 3. Insert execution record inside tenant context
    const [created] = await withTenantContext(finalOrgId, async (tx: any) => {
      return await tx
        .insert(agentExecutions)
        .values({
          projectId,
          organizationId: finalOrgId,
          userId: userId || null,
          sessionId: sessionId || null,
          agentType,
          title: cleanTitle,
          status,
          inputPayload: cleanPayload,
          outputData: {},
          steps: cleanSteps,
          maxRetries,
          approvalToken: approvalToken || null,
          startedAt: status === "RUNNING" ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    });

    // 4. Emit event for live UI stream
    try {
      activityBus.emitEvent({
        id: `exec-${created.id}`,
        type: "tool_execution",
        title: `Agent Execution: ${cleanTitle}`,
        detail: `Status: ${status} • Agent: ${agentType}`,
        status,
        timestamp: created.createdAt.toISOString(),
        projectId,
        organizationId: finalOrgId,
        metadata: {
          executionId: created.id,
          agentType,
          status,
          approvalToken: approvalToken ? "[PRESENT]" : null,
        },
      });
    } catch (busErr) {
      logger.error({ busErr }, "Failed to emit execution to activityBus");
    }

    return created;
  } catch (err: any) {
    logger.error({ err, projectId, title }, "Failed to create agent execution");
    return null;
  }
}

/**
 * Retrieves paginated execution history for a project with strict tenant isolation.
 */
export async function getProjectExecutions(options: GetExecutionsOptions) {
  const { projectId, organizationId, statusFilter = "all", agentType, limit = 50, offset = 0 } = options;
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

    const conditions = [eq(agentExecutions.projectId, projectId)];

    if (statusFilter !== "all" && statusFilter) {
      conditions.push(eq(agentExecutions.status, statusFilter));
    }

    if (agentType) {
      conditions.push(eq(agentExecutions.agentType, agentType));
    }

    const items = await tx
      .select()
      .from(agentExecutions)
      .where(and(...conditions))
      .orderBy(desc(agentExecutions.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

    // Count statistics
    const [totalRes] = await tx
      .select({ count: count() })
      .from(agentExecutions)
      .where(eq(agentExecutions.projectId, projectId));

    const [runningRes] = await tx
      .select({ count: count() })
      .from(agentExecutions)
      .where(and(eq(agentExecutions.projectId, projectId), eq(agentExecutions.status, "RUNNING")));

    const [pendingApprovalRes] = await tx
      .select({ count: count() })
      .from(agentExecutions)
      .where(and(eq(agentExecutions.projectId, projectId), eq(agentExecutions.status, "PENDING_APPROVAL")));

    const [failedRes] = await tx
      .select({ count: count() })
      .from(agentExecutions)
      .where(and(eq(agentExecutions.projectId, projectId), eq(agentExecutions.status, "FAILED")));

    const [completedRes] = await tx
      .select({ count: count() })
      .from(agentExecutions)
      .where(and(eq(agentExecutions.projectId, projectId), eq(agentExecutions.status, "COMPLETED")));

    return {
      executions: items,
      totalCount: Number(totalRes?.count || 0),
      runningCount: Number(runningRes?.count || 0),
      pendingApprovalCount: Number(pendingApprovalRes?.count || 0),
      failedCount: Number(failedRes?.count || 0),
      completedCount: Number(completedRes?.count || 0),
    };
  });
}

/**
 * Gets a single execution run by ID with tenant isolation.
 */
export async function getExecutionById(projectId: string, organizationId: string, executionId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [execution] = await tx
      .select()
      .from(agentExecutions)
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)));

    return execution || null;
  });
}

/**
 * Active cancellation registry for in-flight execution runs.
 */
export const activeCancellations = new Set<string>();

export function isExecutionCancelled(executionId: string): boolean {
  return activeCancellations.has(executionId);
}

export async function isExecutionCancelledAsync(executionId: string): Promise<boolean> {
  if (activeCancellations.has(executionId)) {
    return true;
  }
  try {
    const [row] = await db
      .select({ status: agentExecutions.status })
      .from(agentExecutions)
      .where(eq(agentExecutions.id, executionId));
    if (row && row.status === "CANCELLED") {
      activeCancellations.add(executionId);
      return true;
    }
  } catch (err) {
    logger.error({ err, executionId }, "Error checking cancellation state in DB");
  }
  return false;
}

export function clearExecutionCancellation(executionId: string): void {
  activeCancellations.delete(executionId);
}

/**
 * Safely cancels an active or pending agent execution with precondition checks.
 */
export async function cancelExecution(projectId: string, organizationId: string, executionId: string, reason?: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [existing] = await tx
      .select()
      .from(agentExecutions)
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)));

    if (!existing) {
      return { success: false, error: "Execution run not found", code: 404 };
    }

    if (existing.status === "COMPLETED" || existing.status === "FAILED" || existing.status === "CANCELLED") {
      return {
        success: false,
        error: `Cannot cancel execution in ${existing.status} state`,
        code: 400,
        currentStatus: existing.status,
      };
    }

    const cleanReason = sanitizeActivityText(reason || "Cancelled by user", 200);
    const now = new Date();

    activeCancellations.add(executionId);

    const [updated] = await tx
      .update(agentExecutions)
      .set({
        status: "CANCELLED",
        error: cleanReason,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)))
      .returning();

    if (updated) {
      try {
        activityBus.emitEvent({
          id: `exec-${updated.id}`,
          type: "tool_execution",
          title: `Agent Execution Cancelled: ${updated.title}`,
          detail: cleanReason,
          status: "CANCELLED",
          timestamp: now.toISOString(),
          projectId,
          organizationId,
          metadata: { executionId: updated.id, status: "CANCELLED" },
        });
      } catch (busErr) {
        logger.error({ busErr }, "Failed to emit cancellation to activityBus");
      }
    }

    return { success: true, execution: updated };
  });
}

/**
 * Retries a failed or cancelled agent execution run.
 */
export async function retryExecution(projectId: string, organizationId: string, executionId: string) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [existing] = await tx
      .select()
      .from(agentExecutions)
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)));

    if (!existing) {
      return { success: false, error: "Execution run not found", code: 404 };
    }

    if (existing.status !== "FAILED" && existing.status !== "CANCELLED") {
      return {
        success: false,
        error: `Cannot retry execution in ${existing.status} state. Only FAILED or CANCELLED runs can be retried.`,
        code: 400,
        currentStatus: existing.status,
      };
    }

    if (existing.retryCount >= existing.maxRetries) {
      return {
        success: false,
        error: `Maximum retry attempts (${existing.maxRetries}) reached for this execution run.`,
        code: 400,
        retryCount: existing.retryCount,
      };
    }

    clearExecutionCancellation(executionId);

    const now = new Date();
    const newRetryCount = existing.retryCount + 1;

    const [updated] = await tx
      .update(agentExecutions)
      .set({
        status: "RUNNING",
        retryCount: newRetryCount,
        error: null,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      })
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)))
      .returning();

    if (updated) {
      try {
        activityBus.emitEvent({
          id: `exec-${updated.id}`,
          type: "tool_execution",
          title: `Agent Execution Retried (Attempt ${newRetryCount}): ${updated.title}`,
          detail: `Status: RUNNING`,
          status: "RUNNING",
          timestamp: now.toISOString(),
          projectId,
          organizationId,
          metadata: { executionId: updated.id, status: "RUNNING", retryCount: newRetryCount },
        });
      } catch (busErr) {
        logger.error({ busErr }, "Failed to emit retry event to activityBus");
      }

      // Asynchronously trigger re-execution with real BusinessAgent engine
      import("../agents/businessAgent").then(({ BusinessAgent }) => {
        const agent = new BusinessAgent();
        agent.execute({
          projectId,
          userId: existing.userId || "public_visitor",
          sessionId: existing.sessionId || "temp_session",
          payload: {
            ...((existing.inputPayload as any) || {}),
            executionId,
          },
        }).then(async (result) => {
          const resAny = result as any;
          const finalStatus = resAny.status === "PENDING_CONFIRMATION" ? "PENDING_APPROVAL" : (result.success ? "COMPLETED" : "FAILED");
          await updateExecutionProgress(projectId, organizationId, executionId, {
            status: finalStatus,
            outputData: result.data || { response: resAny.response },
            error: result.error || null,
            steps: resAny.steps || [],
          });
        }).catch(async (execErr: any) => {
          await updateExecutionProgress(projectId, organizationId, executionId, {
            status: "FAILED",
            error: execErr?.message || "Retry execution failed",
          });
        });
      }).catch((impErr) => {
        logger.error({ impErr }, "Failed to dynamic import BusinessAgent for retry");
      });
    }

    return { success: true, execution: updated };
  });
}

/**
 * Approves a pending execution run requiring confirmation.
 */
export async function approveExecution(
  projectId: string,
  organizationId: string,
  executionId: string,
  providedToken?: string
) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const [existing] = await tx
      .select()
      .from(agentExecutions)
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)));

    if (!existing) {
      return { success: false, error: "Execution run not found", code: 404 };
    }

    if (existing.status !== "PENDING_APPROVAL") {
      return {
        success: false,
        error: `Execution is in ${existing.status} state. Only runs in PENDING_APPROVAL state can be approved.`,
        code: 400,
        currentStatus: existing.status,
      };
    }

    if (existing.approvalToken && providedToken && existing.approvalToken !== providedToken) {
      return {
        success: false,
        error: "Invalid or mismatched approval token provided.",
        code: 403,
      };
    }

    clearExecutionCancellation(executionId);
    const now = new Date();

    const [updated] = await tx
      .update(agentExecutions)
      .set({
        status: "RUNNING",
        startedAt: now,
        updatedAt: now,
      })
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId), eq(agentExecutions.organizationId, organizationId)))
      .returning();

    if (updated) {
      try {
        activityBus.emitEvent({
          id: `exec-${updated.id}`,
          type: "tool_execution",
          title: `Agent Action Approved: ${updated.title}`,
          detail: `Status: RUNNING`,
          status: "RUNNING",
          timestamp: now.toISOString(),
          projectId,
          organizationId,
          metadata: { executionId: updated.id, status: "RUNNING" },
        });
      } catch (busErr) {
        logger.error({ busErr }, "Failed to emit approval event to activityBus");
      }

      // Asynchronously trigger action resumption with real BusinessAgent engine
      const tokenToUse = providedToken || existing.approvalToken || (existing.outputData as any)?.confirmationToken || (existing.inputPayload as any)?.confirmationToken;
      const actionId = (existing.outputData as any)?.actionId || (existing.inputPayload as any)?.actionId;
      const actionName = (existing.outputData as any)?.toolExecuted || (existing.inputPayload as any)?.actionName;
      const inputPayload = (existing.inputPayload as any) || {};

      import("../agents/businessAgent").then(({ BusinessAgent }) => {
        const agent = new BusinessAgent();
        agent.execute({
          projectId,
          userId: existing.userId || "public_visitor",
          sessionId: existing.sessionId || "temp_session",
          payload: {
            ...inputPayload,
            actionId,
            actionName,
            confirmationToken: tokenToUse,
            executionId,
          },
        }).then(async (result) => {
          const resAny = result as any;
          const finalStatus = resAny.status === "PENDING_CONFIRMATION" ? "PENDING_APPROVAL" : (result.success ? "COMPLETED" : "FAILED");
          await updateExecutionProgress(projectId, organizationId, executionId, {
            status: finalStatus,
            outputData: result.data || { response: resAny.response },
            error: result.error || null,
            steps: resAny.steps || [],
          });
        }).catch(async (execErr: any) => {
          await updateExecutionProgress(projectId, organizationId, executionId, {
            status: "FAILED",
            error: execErr?.message || "Approval resumption failed",
          });
        });
      }).catch((impErr) => {
        logger.error({ impErr }, "Failed to dynamic import BusinessAgent for approval");
      });
    }

    return { success: true, execution: updated };
  });
}

/**
 * Updates step results, output data, and completion status of an execution.
 */
export async function updateExecutionProgress(
  projectId: string,
  organizationId: string,
  executionId: string,
  updates: {
    status?: ExecutionStatus;
    outputData?: Record<string, any>;
    error?: string | null;
    steps?: any[];
  }
) {
  return await withTenantContext(organizationId, async (tx: any) => {
    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };

    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === "COMPLETED" || updates.status === "FAILED" || updates.status === "CANCELLED") {
        updateData.completedAt = now;
      }
    }

    if (updates.outputData) {
      updateData.outputData = sanitizePayload(updates.outputData);
    }

    if (updates.error !== undefined) {
      updateData.error = updates.error ? sanitizeActivityText(updates.error, 300) : null;
    }

    if (updates.steps) {
      updateData.steps = sanitizePayload(updates.steps);
    }

    const [updated] = await tx
      .update(agentExecutions)
      .set(updateData)
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.projectId, projectId)))
      .returning();

    if (updated) {
      try {
        activityBus.emitEvent({
          id: `exec-${updated.id}`,
          type: "tool_execution",
          title: `Agent Execution Updated: ${updated.title}`,
          detail: `Status: ${updated.status}`,
          status: updated.status,
          timestamp: now.toISOString(),
          projectId,
          organizationId,
          metadata: { executionId: updated.id, status: updated.status },
        });
      } catch (busErr) {
        logger.error({ busErr }, "Failed to emit progress event to activityBus");
      }
    }

    return updated || null;
  });
}
