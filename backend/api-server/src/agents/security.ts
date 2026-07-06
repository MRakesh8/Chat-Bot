import { db } from "@workspace/db";
import { websitePermissions, enterpriseAuditLogs } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { BaseAgent, AgentContext, AgentResult } from "./base";

export class SecurityAgent extends BaseAgent {
  constructor() {
    super("SecurityAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { projectId, userId, payload } = context;
      const proposedAction = payload?.proposedAction; // e.g. { type: 'click', locator: {...}, isDestructive: true }

      if (!proposedAction || proposedAction.type === 'idle') {
        return { success: true, data: { allowed: true } };
      }

      // 1. Fetch RBAC / Permissions
      let allowed = true;
      let requiresConfirmation = false;
      let reason = "Action is permitted.";

      const permissions = await db.select().from(websitePermissions).where(eq(websitePermissions.projectId, projectId));
      
      if (permissions.length > 0) {
        const policy = permissions[0];
        const rbac = policy.rbacRules as any;
        
        // If action is deemed destructive or high-risk (e.g. submit form)
        const isDestructive = proposedAction.apiAction === 'add_to_cart' || 
                              proposedAction.type === 'api_call' || 
                              proposedAction.locator?.css?.includes('submit') ||
                              proposedAction.locator?.css?.includes('delete');

        if (isDestructive) {
          if (!rbac.allowDestructiveActions) {
             allowed = false;
             reason = "Destructive actions are disabled by enterprise policy.";
          }
          if (rbac.requireHumanConfirmation) {
             requiresConfirmation = true;
             reason = "Human-in-the-loop confirmation is required before proceeding.";
          }
        }
      }

      // 2. Audit Logging
      await db.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: proposedAction.type,
        details: {
          userId: userId || null,
          targetElement: proposedAction.locator?.css || proposedAction.apiAction || "unknown",
          status: allowed ? (requiresConfirmation ? "PENDING_CONFIRMATION" : "ALLOWED") : "DENIED",
          riskLevel: proposedAction.type === 'api_call' ? "HIGH" : "LOW"
        }
      });

      return {
        success: true,
        data: {
          allowed,
          requiresConfirmation,
          reason
        },
        confidenceScore: 1.0
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
