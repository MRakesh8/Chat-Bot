import { OpenAI } from "openai";
import { BaseProviderAdapter, ChatCompletionRequest, ChatCompletionResponse } from "./base";
import { NormalizedModel } from "../types";

export class OpenAIAdapter extends BaseProviderAdapter {
  readonly providerId = "openai";

  async discoverModels(apiKey: string, baseUrl?: string): Promise<NormalizedModel[]> {
    const url = baseUrl || "https://api.openai.com/v1";
    const response = await fetch(`${url}/models`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
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
    const client = new OpenAI({ apiKey: request.model.credential.apiKey, baseURL: request.model.credential.baseUrl });
    try {
      const response = await client.chat.completions.create({
        model: request.model.modelId,
        messages: request.messages as any,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens
      });

      return {
        content: response.choices[0]?.message?.content || "",
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        }
      };
    } catch (e: any) {
      throw new Error(this.classifyError(e));
    }
  }

  async *generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    const client = new OpenAI({ apiKey: request.model.credential.apiKey, baseURL: request.model.credential.baseUrl });
    try {
      const stream = await client.chat.completions.create({
        model: request.model.modelId,
        messages: request.messages as any,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          yield { text: chunk.choices[0].delta.content };
        }
      }
    } catch (e: any) {
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