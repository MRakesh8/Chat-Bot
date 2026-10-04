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

      if (result.status === "failed" || result.error) {
         verified = false;
         reason = result.error || "Action engine reported failure.";
      } else {
         // 1. Verify based on action engine verification block (browser automation)
         if (result.verification) {
            const { urlChanged, elementFound, domMutated, successToast } = result.verification;
            if (result.tool === "navigate" && !urlChanged) {
               verified = false;
               reason = "Navigation failed; URL did not change.";
            } else if (result.tool === "click" && !elementFound && !domMutated) {
               verified = false;
               reason = "Target element not found.";
            } else if (result.tool === "type" && !elementFound) {
               verified = false;
               reason = "Target input not found.";
            }
         }

         // 2. Verify server-side integration tool execution results
         if (result.data) {
            const data = result.data;
            if (data.error || data.errors) {
               verified = false;
               reason = typeof data.error === "string" ? data.error : (data.errors?.[0]?.message || "Server tool reported errors.");
            } else if (result.toolExecuted === "shopify_create_product" && !data.product?.id) {
               verified = false;
               reason = "Product creation could not be verified in store response.";
            } else if (result.toolExecuted === "shopify_delete_product" && !data.deleted) {
               verified = false;
               reason = "Product deletion could not be verified in store response.";
            } else if (result.toolExecuted === "shopify_cancel_order" && !data.order?.id && !data.order?.cancelled_at) {
               verified = false;
               reason = "Order cancellation could not be verified in store response.";
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
