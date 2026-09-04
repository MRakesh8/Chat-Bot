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
import { logger } from "../../lib/logger";

const router = Router({ mergeParams: true });

const ExecuteToolBody = z.object({
  input: z.any(),
  confirmationToken: z.string().optional(),
  executionId: z.string().uuid().optional(), // If tracking within an AI workflow
});

router.post("/:toolId/execute", async (req: any, res: any) => {
  let actionName = "unknown";
  let integrationId = "";
  let providerName = "";
  
  try {
    const { projectId, toolId } = req.params;
    const orgId = req.user.organizationId;
    const parsed = ExecuteToolBody.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", details: parsed.error });
    }

    const { input, confirmationToken, executionId } = parsed.data;

    // 1. Check Project Entitlement immediately at the execution boundary
    await checkProjectEntitlement(projectId);

    // 2. Resolve Integration & Tool with strict Tenant Isolation
    let credentialsObj: any = null;
    let toolDefinition: any = null;
    let riskLevel = "READ_ONLY";

    await withTenantContext(orgId, async (tx) => {
      // Fetch Tool
      const tool = await tx.query.integrationTools.findFirst({
        where: and(
          eq(integrationTools.id, toolId),
          eq(integrationTools.projectId, projectId)
        )
      });

      if (!tool) throw new Error("Tool not found or access denied");
      if (!tool.isEnabled) throw new Error("Tool is disabled");
      if (tool.status !== "EXECUTABLE") throw new Error(`Tool cannot be executed in status: ${tool.status}`);

      toolDefinition = tool;
      actionName = tool.actionName;
      riskLevel = tool.riskLevel;
      integrationId = tool.integrationId;

      // Fetch Parent Integration
      const integration = await tx.query.projectIntegrations.findFirst({
        where: and(
          eq(projectIntegrations.id, integrationId),
          eq(projectIntegrations.projectId, projectId)
        )
      });

      if (!integration) throw new Error("Parent integration not found");
      if (integration.status !== "AUTHORIZED") throw new Error(`Integration is not AUTHORIZED (current status: ${integration.status})`);
      if (!integration.encryptedCredentials) throw new Error("Missing credentials for integration execution");

      providerName = integration.provider;
      credentialsObj = JSON.parse(crypto.decrypt(integration.encryptedCredentials));
    });

    // 3. Evaluate Risk and Confirmation Token
    if (riskLevel === "HIGH_RISK_WRITE" || riskLevel === "IRREVERSIBLE") {
      if (!confirmationToken) {
        throw new Error(`Confirmation token required for ${riskLevel} actions`);
      }
      
      const isValid = verifyActionConfirmationToken(confirmationToken, {
        userId: req.user.id,
        projectId,
        sessionId: executionId || "direct-execution", // Fallback for standalone API execution
        actionId: toolId,
        actionType: actionName,
        actionTarget: providerName
      });

      if (!isValid) {
        throw new Error("Invalid, expired, or mismatched confirmation token");
      }
    }

    // 4. Increment Usage Quota (after confirmation passes)
    await checkAndIncrementUsage(projectId, "action", 1);

    // 5. Execute Provider Action
    const providerImpl = providerRegistry.getProvider(providerName);
    
    // Track execution if executionId provided
    let stepId: string | null = null;
    if (executionId) {
      await withTenantContext(orgId, async (tx) => {
        const [step] = await tx.insert(executionSteps).values({
          executionId,
          actionType: actionName,
          actionTarget: providerName,
          status: "executing"
        }).returning();
        stepId = step.id;
      });
    }

    let result: any;
    try {
      result = await providerImpl.executeTool(actionName, input, credentialsObj);
    } catch (execError: any) {
      // Execution failed at provider layer
      await withTenantContext(orgId, async (tx) => {
        await tx.insert(enterpriseAuditLogs).values({
          projectId,
          actionType: "TOOL_EXECUTION_FAILED",
          details: { toolId, actionName, providerName, error: execError.message, userId: req.user.id }
        });
        if (stepId) {
          await tx.update(executionSteps)
            .set({ status: "failed", error: execError.message, updatedAt: new Date() })
            .where(eq(executionSteps.id, stepId));
        }
      });
      throw execError;
    }

    // 6. Execution succeeded, log Audit and Verification
    await withTenantContext(orgId, async (tx) => {
      await tx.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: "TOOL_EXECUTION_SUCCESS",
        details: { toolId, actionName, providerName, userId: req.user.id }
      });
      if (stepId) {
        await tx.update(executionSteps)
          .set({ status: "success", updatedAt: new Date() })
          .where(eq(executionSteps.id, stepId));
      }
    });

    return res.json({ status: "success", data: result });
  } catch (error: any) {
    logger.error(error, `Tool execution failed: ${actionName}`);
    return res.status(400).json({ error: error.message });
  }
});

export default router;
