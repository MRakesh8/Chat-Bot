import { Router } from "express";
import { z } from "zod";
import {
  db,
  projects,
  projectIntegrations,
  integrationTools,
  crypto,
  withTenantContext,
  enterpriseAuditLogs,
  executionSteps,
  workflowExecutions
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { providerRegistry } from "../../services/integrations/provider-registry";
import { checkProjectEntitlement } from "../../security/entitlement";
import { checkAndIncrementUsage } from "../../security/quota";
import { verifyActionConfirmationToken } from "../../security/agentSafety";
import { executeServerTool } from "../../services/tool-execution";
import { logger } from "../../lib/logger";

const router = Router({ mergeParams: true });

const ExecuteToolBody = z.object({
  input: z.any(),
  confirmationToken: z.string().optional(),
  executionId: z.string().uuid().optional(), // If tracking within an AI workflow
});

router.post("/:toolId/execute", async (req: any, res: any) => {
  try {
    const { projectId, toolId } = req.params;
    const orgId = req.user?.organizationId;
    const userId = req.user?.id || "authenticated_user";
    const parsed = ExecuteToolBody.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", details: parsed.error });
    }

    const { input, confirmationToken, executionId } = parsed.data;

    const result = await executeServerTool({
      projectId,
      orgId,
      userId,
      executionId,
      toolId,
      input,
      confirmationToken
    });

    if (!result.success) {
      const statusCode = result.status === "FORBIDDEN" ? 403 :
                         result.status === "ENTITLEMENT_EXPIRED" ? 402 :
                         result.status === "QUOTA_EXCEEDED" ? 429 :
                         result.status === "INVALID_CONFIRMATION_TOKEN" ? 403 : 400;
      return res.status(statusCode).json({
        error: result.error,
        status: result.status,
        requiresConfirmation: result.requiresConfirmation,
        confirmationToken: result.confirmationToken,
        actionId: result.actionId,
        expiresAt: result.expiresAt
      });
    }

    if (result.status === "PENDING_CONFIRMATION") {
      return res.status(202).json({
        status: "PENDING_CONFIRMATION",
        requiresConfirmation: true,
        actionId: result.actionId,
        confirmationToken: result.confirmationToken,
        expiresAt: result.expiresAt,
        riskLevel: result.riskLevel,
        message: result.error
      });
    }

    return res.json({ status: "success", data: result.data, toolExecuted: result.toolExecuted });
  } catch (error: any) {
    logger.error(error, `Tool execution route failed for toolId: ${req.params?.toolId}`);
    return res.status(500).json({ error: error.message || "Internal execution error" });
  }
});

export default router;
