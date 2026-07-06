import { BaseAgent, AgentContext, AgentResult } from "./base";
import { MemoryAgent } from "./memory";
import { PlannerAgent } from "./planner";
import { NavigationAgent } from "./navigation";
import { KnowledgeAgent } from "./knowledge";
import { ContextCompressorAgent } from "./contextCompressor";
import { VerificationAgent } from "./verification";
import { SecurityAgent } from "./security";

export class CoordinatorAgent extends BaseAgent {
  private memoryAgent: MemoryAgent;
  private plannerAgent: PlannerAgent;
  private navigationAgent: NavigationAgent;
  private knowledgeAgent: KnowledgeAgent;
  private contextCompressor: ContextCompressorAgent;
  private verificationAgent: VerificationAgent;
  private securityAgent: SecurityAgent;

  constructor() {
    super("CoordinatorAgent");
    this.memoryAgent = new MemoryAgent();
    this.plannerAgent = new PlannerAgent();
    this.navigationAgent = new NavigationAgent();
    this.knowledgeAgent = new KnowledgeAgent();
    this.contextCompressor = new ContextCompressorAgent();
    this.verificationAgent = new VerificationAgent();
    this.securityAgent = new SecurityAgent();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { projectId, sessionId, payload, userId } = context;

      // 1. Compress raw context
      const compressedRes = await this.contextCompressor.execute({ projectId, sessionId, payload: payload?.context });
      const contextGraph = compressedRes.data;

      // 2. Retrieve Memory
      const memoryRes = await this.memoryAgent.execute({ projectId, sessionId });
      const sessionMemory = memoryRes.data;

      // 3. Verify previous action if applicable
      let verification = { verified: true, reason: "" };
      if (sessionMemory?.lastAction) {
         const verRes = await this.verificationAgent.execute({ projectId, sessionId, payload: { lastAction: sessionMemory.lastAction, currentUrl: contextGraph?.page?.url } });
         verification = verRes.data;
      }

      // 4. Retrieve Knowledge
      const knowRes = await this.knowledgeAgent.execute({ projectId, sessionId });
      const knowledge = knowRes.data;

      // 5. Build/Update Plan
      const planRes = await this.plannerAgent.execute({ 
        projectId, 
        sessionId, 
        payload: { intent: payload?.intent, currentUrl: contextGraph?.page?.url, memory: sessionMemory, verification } 
      });
      const plan = planRes.data?.plan;

      // 6. Decide Navigation/Execution Step
      const navRes = await this.navigationAgent.execute({ 
        projectId, 
        sessionId, 
        payload: { plan, graph: contextGraph } 
      });
      const action = navRes.data?.action;

      // 7. Security & Permissions Gate
      let security = { allowed: true, requiresConfirmation: false, reason: "" };
      if (action && action.type !== 'idle') {
        const secRes = await this.securityAgent.execute({
          projectId,
          sessionId,
          userId,
          payload: { proposedAction: action }
        });
        security = secRes.data;

        if (!security.allowed) {
           action.type = 'blocked';
           action.reason = security.reason;
        } else if (security.requiresConfirmation) {
           action.type = 'pending_confirmation';
           action.reason = security.reason;
        }
      }

      // 8. Save State
      await this.memoryAgent.execute({
        projectId,
        sessionId,
        payload: { currentPlan: plan, lastAction: action, lastContext: contextGraph }
      });

      return {
        success: true,
        data: {
          plan,
          action,
          security,
          verification,
          knowledge
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
