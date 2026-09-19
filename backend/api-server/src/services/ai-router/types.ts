export interface ModelCapability {
  textGeneration: boolean;
  streaming: boolean;
  vision: boolean;
  tools: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  embedding: boolean;
  audio: boolean;
}

export interface NormalizedModel {
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability;
  contextLimit?: number;
  maxOutput?: number;
}

export interface RoutingRequirement {
  capabilities: Partial<ModelCapability>;
  preferredModel?: string; // Hint from user
  preferredProvider?: string; // Hint from user
  projectId?: string;
  userId?: string;
  operation: "chat" | "embed" | "agent";
}

export interface ResolvedModel {
  provider: string;
  modelId: string;
  credential: {
    id: string;
    apiKey: string;
    type: "project" | "user" | "system";
    baseUrl?: string;
  };
}