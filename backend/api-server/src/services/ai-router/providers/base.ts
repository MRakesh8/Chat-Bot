import { NormalizedModel, ResolvedModel } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model: ResolvedModel;
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class BaseProviderAdapter {
  abstract readonly providerId: string;

  abstract discoverModels(apiKey: string, baseUrl?: string): Promise<NormalizedModel[]>;
  
  abstract generateChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  
  abstract generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }>;
  
  abstract classifyError(error: any): "MODEL_NOT_FOUND" | "RATE_LIMITED" | "INVALID_CREDENTIAL" | "PROVIDER_UNAVAILABLE" | "UNKNOWN_ERROR";
}