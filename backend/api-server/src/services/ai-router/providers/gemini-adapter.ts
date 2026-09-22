import { GoogleGenAI } from "@google/genai";
import { BaseProviderAdapter, ChatCompletionRequest, ChatCompletionResponse } from "./base";
import { NormalizedModel } from "../types";

export class GeminiAdapter extends BaseProviderAdapter {
  readonly providerId = "gemini";

  private getHttpOptions(baseUrl?: string): any {
    const rawUrl = baseUrl || process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    if (rawUrl) {
      const cleanUrl = rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
      if (cleanUrl) return { baseUrl: cleanUrl };
    }
    return undefined;
  }

  async discoverModels(apiKey: string, baseUrl?: string): Promise<NormalizedModel[]> {
    const rawUrl = baseUrl || process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
    const cleanUrl = rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
    const response = await fetch(`${cleanUrl}/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      if (response.status === 403 || response.status === 401 || response.status === 400) {
        throw new Error("INVALID_CREDENTIAL: The provided Gemini API key is invalid or malformed.");
      }
      throw new Error(`Gemini API Error: ${response.status}`);
    }
    const data = await response.json() as any;
    
    return data.models
      .filter((m: any) => {
        const supportsChat = m.supportedGenerationMethods?.includes("generateContent");
        const name = (m.name || "").toLowerCase();
        return supportsChat && !name.includes("tts") && !name.includes("audio");
      })
      .map((m: any) => {
        const modelId = m.name.replace("models/", "");
        return {
          provider: "gemini",
          modelId,
          displayName: m.displayName || modelId,
          capabilities: {
            textGeneration: true,
            streaming: true,
            vision: modelId.includes("vision") || modelId.includes("pro") || modelId.includes("flash"),
            tools: true,
            structuredOutput: true,
            reasoning: modelId.includes("thinking"),
            embedding: false,
            audio: modelId.includes("audio")
          },
          contextLimit: m.inputTokenLimit || 128000,
          maxOutput: m.outputTokenLimit || 8192
        } as NormalizedModel;
      });
  }

  async generateChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const httpOptions = this.getHttpOptions(request.model.credential.baseUrl);
    const client = new GoogleGenAI({ apiKey: request.model.credential.apiKey, ...(httpOptions ? { httpOptions } : {}) });
    const contents = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const systemInstruction = request.messages.find(m => m.role === "system")?.content;
    const body: any = {
      contents,
      config: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens
      }
    };
    if (systemInstruction) {
      body.config.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    try {
      const response = await client.models.generateContent({
        model: request.model.modelId,
        ...body
      });

      return {
        content: response.text || "",
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0
        }
      };
    } catch (e: any) {
      throw new Error(this.classifyError(e));
    }
  }

  async *generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    const httpOptions = this.getHttpOptions(request.model.credential.baseUrl);
    const client = new GoogleGenAI({ apiKey: request.model.credential.apiKey, ...(httpOptions ? { httpOptions } : {}) });
    const contents = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const systemInstruction = request.messages.find(m => m.role === "system")?.content;
    const body: any = {
      contents,
      config: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens
      }
    };
    if (systemInstruction) {
      body.config.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    try {
      const stream = await client.models.generateContentStream({
        model: request.model.modelId,
        ...body
      });
      for await (const chunk of stream) {
        if (chunk.text) yield { text: chunk.text };
      }
    } catch (e: any) {
      throw new Error(this.classifyError(e));
    }
  }

  classifyError(error: any): any {
    const status = error?.status || error?.response?.status;
    const msg = error?.message?.toLowerCase() || "";
    
    if (status === 401 || status === 403 || (status === 400 && (msg.includes("api key") || msg.includes("apikey") || msg.includes("invalid key")))) {
      return "INVALID_CREDENTIAL";
    }
    if (status === 429 || msg.includes("quota") || msg.includes("rate limit")) {
      return "RATE_LIMITED";
    }
    if (status === 404) {
      if (msg.includes("models/") || msg.includes("not found") || msg.includes("model")) {
        return "MODEL_NOT_FOUND";
      }
      return "INVALID_REQUEST";
    }
    if (status === 400) return "INVALID_REQUEST";
    if (status >= 500) return "PROVIDER_UNAVAILABLE";
    if (msg.includes("invalid_credential")) return "INVALID_CREDENTIAL";
    return "UNKNOWN_ERROR";
  }
}