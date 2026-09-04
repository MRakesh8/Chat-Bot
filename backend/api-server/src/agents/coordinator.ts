import { BaseAgent, AgentContext, AgentResult } from "./base";
import { PlannerAgent } from "./planner";
import { VerificationAgent } from "./verification";
import { SecurityAgent } from "./security";
import { BusinessAgent } from "./businessAgent";
import { generateActionConfirmationToken } from "../security";
import { db } from "@workspace/db";
import { workflowExecutions, executionSteps } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

export class CoordinatorAgent extends BaseAgent {
  private plannerAgent: PlannerAgent;
  private verificationAgent: VerificationAgent;
  private securityAgent: SecurityAgent;
  private businessAgent: BusinessAgent;

  constructor() {
    super("CoordinatorAgent");
    this.plannerAgent = new PlannerAgent();
    this.verificationAgent = new VerificationAgent();
    this.securityAgent = new SecurityAgent();
    this.businessAgent = new BusinessAgent();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { projectId, sessionId, payload, userId } = context;

      // 1. Resume Execution from Legacy Client Browser Workflow Result
      if (payload?.resumeExecution) {
        const executionId = payload.executionId;
        const result = payload.actionResult;
        
        const [execRecord] = await db.select().from(workflowExecutions).where(eq(workflowExecutions.id, executionId));
        if (!execRecord) return { success: false, error: "Execution not found" };

        let status = result.status; // success or failed
        
        // Verification Step for browser actions
        const verRes = await this.verificationAgent.execute({
          projectId, sessionId, payload: { result }
        });
        
        if (!verRes.data?.verified) {
           status = "failed";
        }

        const [currentStep] = await db.select().from(executionSteps)
            .where(eq(executionSteps.id, result.actionId));

        if (status === "failed") {
            const retryCount = (currentStep?.retryCount || 0) + 1;
            if (retryCount <= 3) {
                await db.update(executionSteps).set({ status: "retry", retryCount }).where(eq(executionSteps.id, result.actionId));
                return { success: true, data: { action: { ...currentStep, type: "retry" }, executionId } };
            } else {
                await db.update(executionSteps).set({ status: "failed_final" }).where(eq(executionSteps.id, result.actionId));
                await db.update(workflowExecutions).set({ status: "failed" }).where(eq(workflowExecutions.id, executionId));
                return { success: true, data: { status: "failed_final" } };
            }
        }

        await db.update(executionSteps).set({ status: "success" }).where(eq(executionSteps.id, result.actionId));
        
        const nextIndex = execRecord.currentStepIndex + 1;
        const plan: any = execRecord.plan;
        
        if (nextIndex < plan.length) {
            await db.update(workflowExecutions).set({ currentStepIndex: nextIndex }).where(eq(workflowExecutions.id, executionId));
            const nextAction = plan[nextIndex];
            
            // Security Check for next browser action
            const secRes = await this.securityAgent.execute({ projectId, sessionId, userId, payload: { proposedAction: nextAction } });
            
            const [newStep] = await db.insert(executionSteps).values({
               executionId,
               actionType: nextAction.actionType || nextAction.type,
               actionTarget: nextAction.actionTarget || nextAction.target,
               actionValue: nextAction.actionValue || nextAction.value,
               status: secRes.data.requiresConfirmation ? "pending_approval" : "planned"
            }).returning();

            if (secRes.data.requiresConfirmation) {
              const { token, expiresAt } = generateActionConfirmationToken({
                userId: userId || "public_visitor",
                projectId,
                sessionId,
                actionId: newStep.id,
                actionType: nextAction.actionType || nextAction.type,
                actionTarget: nextAction.actionTarget || nextAction.target || ""
              });
              secRes.data.confirmationToken = token;
              secRes.data.expiresAt = expiresAt;
            }

            return { success: true, data: { action: { ...nextAction, id: newStep.id }, executionId, security: secRes.data } };
        } else {
            await db.update(workflowExecutions).set({ status: "completed" }).where(eq(workflowExecutions.id, executionId));
            return { success: true, data: { status: "workflow_completed" } };
        }
      }

      // 2. Primary Phase 2F Delegation: BusinessAgent Evaluation
      if (payload?.intent || payload?.message) {
        const businessResult = await this.businessAgent.execute(context);
        
        // If BusinessAgent handled an action, RAG information query, clarification, or unsupported intent, return it directly
        if (businessResult.success || businessResult.data?.intent) {
          return businessResult;
        }
      }

      // 3. Fallback: PlannerAgent for Client Browser Multi-Step Workflows
      const planRes = await this.plannerAgent.execute({ projectId, sessionId, payload });
      if (!planRes.success) return planRes;
      
      const plan = planRes.data?.plan?.steps;
      if (!plan || plan.length === 0) return { success: true, data: { action: null } };

      const [newExec] = await db.insert(workflowExecutions).values({
          sessionId: sessionId as any,
          plan,
          status: "active"
      }).returning();

      const firstAction = plan[0];
      const secRes = await this.securityAgent.execute({ projectId, sessionId, userId, payload: { proposedAction: firstAction } });
      
      const [newStep] = await db.insert(executionSteps).values({
          executionId: newExec.id,
          actionType: firstAction.actionType || firstAction.type,
          actionTarget: firstAction.actionTarget || firstAction.target,
          actionValue: firstAction.actionValue || firstAction.value,
          status: secRes.data.requiresConfirmation ? "pending_approval" : "planned"
      }).returning();

      if (secRes.data.requiresConfirmation) {
        const { token, expiresAt } = generateActionConfirmationToken({
          userId: userId || "public_visitor",
          projectId,
          sessionId,
          actionId: newStep.id,
          actionType: firstAction.actionType || firstAction.type,
          actionTarget: firstAction.actionTarget || firstAction.target || ""
        });
        secRes.data.confirmationToken = token;
        secRes.data.expiresAt = expiresAt;
      }

      return {
        success: true,
        data: {
          executionId: newExec.id,
          action: { ...firstAction, id: newStep.id },
          security: secRes.data
        }
      };
    } catch (error: any) {
      console.error("Coordinator Error:", error);
      return { success: false, error: error.message };
    }
  }
}
