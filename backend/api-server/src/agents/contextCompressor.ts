import { BaseAgent, AgentContext, AgentResult } from "./base";

export class ContextCompressorAgent extends BaseAgent {
  constructor() {
    super("ContextCompressorAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { payload } = context;
      if (!payload || !payload.graph) {
        return { success: true, data: payload }; // Nothing to compress
      }

      // Deep clone to avoid mutating the original
      const compressed = JSON.parse(JSON.stringify(payload));
      const graph = compressed.graph;

      if (graph.nodes) {
        // Compress content nodes by removing items with importance < 50
        // But keep anything that has confidence/importance missing just in case
        for (const key of Object.keys(graph.nodes)) {
          if (Array.isArray(graph.nodes[key])) {
            graph.nodes[key] = graph.nodes[key].filter((node: any) => {
              if (node.locator && node.locator.importance !== undefined) {
                return node.locator.importance >= 40; // Keep moderately important
              }
              return true; 
            });
          }
        }
      }

      compressed.metadata.compressionRatio = 
        JSON.stringify(compressed).length / JSON.stringify(payload).length;

      return {
        success: true,
        data: compressed,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
