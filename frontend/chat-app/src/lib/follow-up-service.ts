export interface FollowUpContext {
  lastAiMessage: string;
  conversationHistory?: { role: string; content: string }[];
  projectTags?: string[];
}

export interface IFollowUpService {
  generateSuggestions(context: FollowUpContext): Promise<string[]>;
}

export class HeuristicFollowUpService implements IFollowUpService {
  async generateSuggestions(context: FollowUpContext): Promise<string[]> {
    const { lastAiMessage } = context;
    if (!lastAiMessage) return [];
    
    const msg = lastAiMessage.toLowerCase();
    const suggestions: Set<string> = new Set();
    
    // Heuristic rules based on content keywords
    if (msg.includes("error") || msg.includes("bug") || msg.includes("failed") || msg.includes("exception")) {
      suggestions.add("How can I safely fix this error?");
      suggestions.add("Can you provide a code example to resolve this?");
    }
    
    if (msg.includes("react") || msg.includes("component") || msg.includes("ui") || msg.includes("hook")) {
      suggestions.add("How do I style this component?");
      suggestions.add("What are the best practices for this in React?");
    }
    
    if (msg.includes("database") || msg.includes("sql") || msg.includes("query") || msg.includes("table")) {
      suggestions.add("How can I optimize this query?");
      suggestions.add("Can you show me the schema structure?");
    }
    
    if (msg.includes("api") || msg.includes("endpoint") || msg.includes("fetch") || msg.includes("rest")) {
      suggestions.add("How do I handle authentication for this API?");
      suggestions.add("What is the standard JSON response format?");
    }
    
    if (msg.includes("deploy") || msg.includes("production") || msg.includes("hosting") || msg.includes("build")) {
      suggestions.add("What are the recommended hosting platforms?");
      suggestions.add("How do I set up CI/CD for this deployment?");
    }
    
    if (msg.includes("security") || msg.includes("auth") || msg.includes("login") || msg.includes("password")) {
      suggestions.add("How can I make this implementation more secure?");
      suggestions.add("What are the common vulnerabilities here?");
    }
    
    // Check if the message is very short
    if (lastAiMessage.length < 150) {
      suggestions.add("Can you elaborate on that?");
      suggestions.add("Could you give me a concrete example?");
    }

    // Default fallbacks if heuristics don't match enough
    const fallbacks = [
      "Can you explain this in more detail?",
      "What are the alternatives to this approach?",
      "Can you provide a step-by-step example?",
      "Are there any edge cases I should consider?",
      "How does this approach scale in production?"
    ];

    // Build final list of 3
    const results = Array.from(suggestions);
    for (const f of fallbacks) {
      if (results.length >= 3) break;
      if (!results.includes(f)) results.push(f);
    }

    // Shuffle the results slightly for variety if we had more than 3 matches initially
    return results.slice(0, 3);
  }
}

// Export a singleton instance. Later, this can be swapped with an AIFollowUpService.
export const followUpService: IFollowUpService = new HeuristicFollowUpService();
