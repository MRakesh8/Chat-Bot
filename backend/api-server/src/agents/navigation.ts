import { BaseAgent, AgentContext, AgentResult } from "./base";

export class NavigationAgent extends BaseAgent {
  constructor() {
    super("NavigationAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { payload } = context;
      
      // Simulate navigation reasoning based on the current step
      const targetElement = payload?.plan?.steps?.find((s: any) => s.status === "pending")?.target;
      const graph = payload?.graph;
      const activeAdapter = payload?.context?.metadata?.activeAdapter || null;

      let action = null;

      if (activeAdapter) {
        // Platform specific API mode
        action = {
          type: "api_call",
          adapter: activeAdapter,
          apiAction: targetElement, // e.g., 'add_to_cart'
          reason: `Using native ${activeAdapter} API for higher reliability.`
        };
      } else if (targetElement && graph) {
        // DOM Mode
        action = {
          type: "navigate",
          locator: { css: `.${targetElement}` },
          reason: `Found target ${targetElement} in context graph.`
        };
      } else {
        action = {
          type: "idle",
          reason: "No navigation target identified."
        };
      }

      return {
        success: true,
        data: { action },
        confidenceScore: 0.90
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
