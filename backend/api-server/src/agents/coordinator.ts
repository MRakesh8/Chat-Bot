import { BaseAgent, AgentContext, AgentResult } from "./base";
import { PlannerAgent, WorkflowStep } from "./planner";
import { VerificationAgent } from "./verification";
import { SecurityAgent } from "./security";
import { BusinessAgent } from "./businessAgent";
import { generateActionConfirmationToken, verifyActionConfirmationToken } from "../security";
import { executeServerTool } from "../services/tool-execution";
import { db } from "@workspace/db";
import { workflowExecutions, executionSteps, agentExecutions } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  createExecution,
  updateExecutionProgress,
  isExecutionCancelled,
  isExecutionCancelledAsync
} from "../services/execution-governance";
import { logger } from "../lib/logger";

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

  /**
   * Resolves dynamic input mapping from previous step outputs.
   * e.g. "$step_1.data.products[0].id" -> extracts productId
   */
  private resolveMappedValue(expression: string, completedStepMap: Map<string, any>): any {
    if (!expression || !expression.startsWith("$")) return expression;

    const parts = expression.substring(1).split(".");
    const stepId = parts[0];
    const prevStepResult = completedStepMap.get(stepId);

    if (!prevStepResult) return undefined;

    let current = prevStepResult;
    for (let i = 1; i < parts.length; i++) {
      if (current === undefined || current === null) return undefined;
      const part = parts[i];
      // Handle array indices e.g. products[0]
      const arrayMatch = part.match(/^([a-zA-Z0-9_-]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const prop = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);
        current = current[prop]?.[index];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Executes an ordered multi-step business workflow with dependency checking,
   * human approval pauses, schema validation, idempotency, and authoritative verification.
   */
  async executeWorkflow(context: AgentContext, plan: WorkflowStep[]): Promise<AgentResult> {
    const { projectId, userId, sessionId, payload } = context;
    const executionId = payload?.executionId;
    const confirmationToken = payload?.confirmationToken;

    const completedStepMap = new Map<string, any>();
    const executedSteps: WorkflowStep[] = [];
    let haltedForApproval = false;
    let approvalPayload: any = null;

    // Load any already completed steps into memory (for workflow resumption)
    for (const step of plan) {
      if (step.status === "COMPLETED" && step.result) {
        completedStepMap.set(step.stepId, { data: step.result, ...step.result });
      }
    }

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];

      // 1. Skip if already completed in a prior turn
      if (step.status === "COMPLETED") {
        executedSteps.push(step);
        continue;
      }

      // 2. Cancellation Check
      if (executionId) {
        if (isExecutionCancelled(executionId) || (await isExecutionCancelledAsync(executionId))) {
          step.status = "SKIPPED";
          step.error = "Workflow run was cancelled by user.";
          executedSteps.push(step);

          // Mark remaining steps as SKIPPED
          for (let j = i + 1; j < plan.length; j++) {
            plan[j].status = "SKIPPED";
            plan[j].error = "Workflow run was cancelled by user.";
            executedSteps.push(plan[j]);
          }

          return {
            success: false,
            data: {
              status: "CANCELLED",
              executionId,
              steps: executedSteps,
              response: "Workflow execution was cancelled by user.",
            },
          };
        }
      }

      // 3. Dependency Check
      if (step.dependsOn && step.dependsOn.length > 0) {
        const hasUnmetDependency = step.dependsOn.some((depId) => {
          const depStep = executedSteps.find((s) => s.stepId === depId);
          return !depStep || depStep.status !== "COMPLETED";
        });

        if (hasUnmetDependency) {
          step.status = "SKIPPED";
          step.error = `Prerequisite step(s) [${step.dependsOn.join(", ")}] did not complete successfully.`;
          executedSteps.push(step);
          continue;
        }
      }

      // 4. Resolve Dynamic Input Mapping
      const resolvedInput = { ...(step.input || {}) };
      if (step.inputMapping) {
        for (const [key, expr] of Object.entries(step.inputMapping)) {
          const resolvedVal = this.resolveMappedValue(expr, completedStepMap);
          if (resolvedVal !== undefined) {
            resolvedInput[key] = resolvedVal;
          }
        }
      }

      // 5. Execute Step via Authoritative Server Tool Primitive
      step.status = "RUNNING";
      const idempotencyKey = executionId ? `${executionId}_${step.stepId}` : undefined;

      const execResult = await executeServerTool({
        projectId,
        userId: userId || "public_visitor",
        sessionId: sessionId || "workflow_session",
        executionId,
        actionName: step.actionType,
        input: resolvedInput,
        confirmationToken: confirmationToken || undefined,
        customerContext: context.customerContext,
        idempotencyKey,
      });

      // Human Approval Gate & Consequential Confirmation
      if (execResult.status === "PENDING_CONFIRMATION" || execResult.status === "INVALID_CONFIRMATION_TOKEN") {
        step.status = "PENDING_APPROVAL";
        haltedForApproval = true;
        approvalPayload = {
          status: "PENDING_CONFIRMATION",
          requiresConfirmation: true,
          executionId,
          stepToConfirm: {
            ...step,
            input: resolvedInput,
          },
          confirmationToken: execResult.confirmationToken,
          expiresAt: execResult.expiresAt,
          completedSteps: executedSteps,
          response: execResult.status === "INVALID_CONFIRMATION_TOKEN"
            ? "Invalid or expired confirmation token. Action remains paused."
            : `Approval Required: Step "${step.description}" is classified as ${execResult.riskLevel || step.riskLevel} risk. Please confirm to proceed.`,
        };

        executedSteps.push(step);
        break; // Stop execution until user approves
      }

      if (!execResult.success) {
        step.status = "FAILED";
        step.error = execResult.error || "Step execution failed.";
        executedSteps.push(step);

        // Mark any remaining steps that depend on this one as SKIPPED
        for (let j = i + 1; j < plan.length; j++) {
          plan[j].status = "SKIPPED";
          plan[j].error = `Skipped: Dependent step '${step.description}' failed.`;
          executedSteps.push(plan[j]);
        }
        break; // Stop execution on failure
      }

      // Step succeeded
      step.status = "COMPLETED";
      step.result = execResult.data;
      step.verification = execResult.verification;
      completedStepMap.set(step.stepId, { data: execResult.data, ...execResult.data });
      executedSteps.push(step);
    }

    if (haltedForApproval) {
      return {
        success: true,
        data: approvalPayload,
      };
    }

    // Evaluate overall workflow outcome
    const hasFailures = executedSteps.some((s) => s.status === "FAILED");
    const completedCount = executedSteps.filter((s) => s.status === "COMPLETED").length;
    const allCompleted = completedCount === plan.length && !hasFailures;

    const verificationSummary = this.verificationAgent.verifyWorkflow(executedSteps);

    // Build user-facing response summary
    const stepDescriptions = executedSteps.map((s) => {
      const mark = s.status === "COMPLETED" ? "✓" : s.status === "FAILED" ? "✗" : "○";
      return `${mark} Step: ${s.description} (${s.status})`;
    }).join("\n");

    const finalResponse = allCompleted
      ? `Successfully executed all ${completedCount} workflow steps:\n${stepDescriptions}`
      : `Workflow stopped: ${completedCount}/${plan.length} steps completed.\n${stepDescriptions}`;

    return {
      success: allCompleted,
      data: {
        status: allCompleted ? "COMPLETED" : "FAILED",
        executionId,
        steps: executedSteps,
        completedCount,
        totalSteps: plan.length,
        response: finalResponse,
        verificationSummary,
      },
    };
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

      // 2. Direct Execution of Multi-Step Workflow Plan
      if (payload?.workflowPlan && Array.isArray(payload.workflowPlan)) {
        return await this.executeWorkflow(context, payload.workflowPlan);
      }

      // 3. Primary Phase 2F Delegation: BusinessAgent Evaluation
      if (payload?.intent || payload?.message) {
        const businessResult = await this.businessAgent.execute(context);

        // If BusinessAgent handled an action, RAG information query, clarification, or unsupported intent, return it directly
        if (businessResult.success || businessResult.data?.intent) {
          return businessResult;
        }
      }

      // 4. Fallback: PlannerAgent for Client Browser Multi-Step Workflows
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
      logger.error({ error }, "Coordinator Error");
      return { success: false, error: error.message };
    }
  }
}
