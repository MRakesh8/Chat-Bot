export interface AgentContext {
  projectId: string;
  sessionId: string;
  userId?: string;
  payload?: any;
  signal?: AbortSignal;
  customerContext?: {
    customerId?: string;
    email?: string;
    phone?: string;
    customerName?: string;
    verified?: boolean;
    isBusinessAdmin?: boolean;
  };
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
  confidenceScore?: number;
}

export abstract class BaseAgent {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;

  getName(): string {
    return this.name;
  }
}
