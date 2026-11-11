import { OpenAI } from "openai";
import nodeCrypto from "crypto";
import { BaseProviderAdapter, ChatCompletionRequest, ChatCompletionResponse } from "./base";
import { NormalizedModel } from "../types";

const MAX_OPENAI_CLIENT_CACHE = 100;
const openaiClientCache = new Map<string, OpenAI>();

export class OpenAIAdapter extends BaseProviderAdapter {
  readonly providerId = "openai";

  private getClient(apiKey: string, baseURL?: string): OpenAI {
    const keyHash = nodeCrypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
    const cacheKey = `${keyHash}:${baseURL || "default"}`;
    let client = openaiClientCache.get(cacheKey);
    if (!client) {
      if (openaiClientCache.size >= MAX_OPENAI_CLIENT_CACHE) {
        const oldestKey = openaiClientCache.keys().next().value;
        if (oldestKey) openaiClientCache.delete(oldestKey);
      }
      client = new OpenAI({ apiKey, baseURL });
      openaiClientCache.set(cacheKey, client);
    }
    return client;
  }

  async discoverModels(apiKey: string, baseUrl?: string, signal?: AbortSignal): Promise<NormalizedModel[]> {
    const url = baseUrl || "https://api.openai.com/v1";
    const timeoutSignal = AbortSignal.timeout(5000);
    const combinedSignal = signal
      ? (typeof (AbortSignal as any).any === "function" ? (AbortSignal as any).any([signal, timeoutSignal]) : signal)
      : timeoutSignal;

    const response = await fetch(`${url}/models`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: combinedSignal
    });
    
    if (!response.ok) {
      if (response.status === 401) throw new Error("Invalid OpenAI API key.");
      throw new Error(`OpenAI API Error: ${response.statusText}`);
    }
    const data = await response.json() as any;
    
    return data.data
      .filter((m: any) => m.id.startsWith("gpt-") || m.id.startsWith("o1") || m.id.startsWith("o3"))
      .map((m: any) => {
        const isReasoning = m.id.startsWith("o1") || m.id.startsWith("o3");
        return {
          provider: "openai",
          modelId: m.id,
          displayName: m.id,
          capabilities: {
            textGeneration: true,
            streaming: true, // simplified
            vision: m.id.includes("vision") || m.id === "gpt-4o",
            tools: !isReasoning,
            structuredOutput: !isReasoning,
            reasoning: isReasoning,
            embedding: false,
            audio: false
          },
          contextLimit: 128000,
          maxOutput: 4096
        } as NormalizedModel;
      });
  }

  async generateChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (request.signal?.aborted) {
      throw new Error("Request was aborted");
    }
    const client = this.getClient(request.model.credential.apiKey, request.model.credential.baseUrl);
    try {
      const response = await client.chat.completions.create({
        model: request.model.modelId,
        messages: request.messages as any,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens
      }, request.signal ? { signal: request.signal } : undefined);

      return {
        content: response.choices[0]?.message?.content || "",
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        }
      };
    } catch (e: any) {
      if (request.signal?.aborted) throw new Error("Request was aborted");
      throw new Error(this.classifyError(e));
    }
  }

  async *generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    if (request.signal?.aborted) {
      return;
    }
    const client = this.getClient(request.model.credential.apiKey, request.model.credential.baseUrl);
    try {
      const stream = await client.chat.completions.create({
        model: request.model.modelId,
        messages: request.messages as any,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true
      }, request.signal ? { signal: request.signal } : undefined);

      for await (const chunk of stream) {
        if (request.signal?.aborted) break;
        if (chunk.choices[0]?.delta?.content) {
          yield { text: chunk.choices[0].delta.content };
        }
      }
    } catch (e: any) {
      if (request.signal?.aborted) return;
      throw new Error(this.classifyError(e));
    }
  }

  classifyError(error: any): any {
    const status = error?.status;
    if (status === 404) return "MODEL_NOT_FOUND";
    if (status === 429) return "RATE_LIMITED";
    if (status === 401 || status === 403) return "INVALID_CREDENTIAL";
    if (status >= 500) return "PROVIDER_UNAVAILABLE";
    return "UNKNOWN_ERROR";
  }
}