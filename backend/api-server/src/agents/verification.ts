import { BaseAgent, AgentContext, AgentResult } from "./base";

export class VerificationAgent extends BaseAgent {
  constructor() {
    super("VerificationAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { payload } = context;
      
      const result = payload?.result;
      
      let verified = true;
      let reason = "Action appears successful.";

      if (!result) {
         return { success: true, data: { verified: false, reason: "No result provided." } };
      }

      if (result.status === "failed") {
         verified = false;
         reason = result.error || "Action engine reported failure.";
      } else {
         // Verify based on action engine verification block
         if (result.verification) {
            const { urlChanged, elementFound, domMutated, successToast } = result.verification;
            if (result.tool === "navigate" && !urlChanged) {
               verified = false;
               reason = "Navigation failed; URL did not change.";
            } else if (result.tool === "click" && !elementFound && !domMutated) {
               // A click might not mutate DOM immediately, but if it didn't even find the element, it fails
               verified = false;
               reason = "Target element not found.";
            } else if (result.tool === "type" && !elementFound) {
               verified = false;
               reason = "Target input not found.";
            }
         }
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
