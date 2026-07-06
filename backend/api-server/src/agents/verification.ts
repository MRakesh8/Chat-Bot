import { BaseAgent, AgentContext, AgentResult } from "./base";

export class VerificationAgent extends BaseAgent {
  constructor() {
    super("VerificationAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { payload } = context;
      
      // Simulates checking if the last action succeeded based on the new context
      const lastAction = payload?.lastAction;
      const currentUrl = payload?.currentUrl;

      let verified = true;
      let reason = "Action appears successful.";

      if (lastAction && lastAction.type === "navigate" && !currentUrl.includes(lastAction.expectedPath)) {
         verified = false;
         reason = "Navigation failed; URL did not change to expected path.";
      }

      return {
        success: true,
        data: { verified, reason },
        confidenceScore: 0.99
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
