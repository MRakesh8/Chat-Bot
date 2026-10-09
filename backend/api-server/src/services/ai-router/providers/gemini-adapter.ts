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
    
    const filtered = data.models
      .filter((m: any) => {
        const supportsChat = m.supportedGenerationMethods?.includes("generateContent");
        const name = (m.name || "").toLowerCase();
        // Exclude TTS, audio-only, specialized robotics/lyria/research models
        const isSpecialized = name.includes("tts") || name.includes("audio") || name.includes("lyria") || name.includes("robotics") || name.includes("deep-research") || name.includes("gemma");
        return supportsChat && !isSpecialized;
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

    // Sort models by reliability and speed preference: flash-lite > flash > pro
    const getPriority = (id: string) => {
      if (id === "gemini-2.5-flash-lite" || id === "gemini-flash-lite-latest") return 100;
      if (id === "gemini-2.5-flash" || id === "gemini-flash-latest") return 90;
      if (id === "gemini-2.5-pro" || id === "gemini-pro-latest") return 80;
      if (id.includes("flash-lite")) return 70;
      if (id.includes("flash")) return 60;
      return 10;
    };

    return filtered.sort((a: NormalizedModel, b: NormalizedModel) => getPriority(b.modelId) - getPriority(a.modelId));
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
      throw e;
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
      throw e;
    }
  }

  classifyError(error: any): any {
    if (!error) return "UNKNOWN_ERROR";
    const status = error?.status || error?.response?.status || error?.code;
    const msg = (error?.message || String(error || "")).toLowerCase();

    // 1. DNS / Network / Connection Failures
    if (
      msg.includes("no such host") ||
      msg.includes("getaddrinfo") ||
      msg.includes("enotfound") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("fetch failed") ||
      msg.includes("network error") ||
      msg.includes("socket hang up") ||
      msg.includes("connection refused")
    ) {
      return "PROVIDER_UNAVAILABLE";
    }

    // 2. Invalid Credential (401 / 403 / Bad Key)
    if (
      status === 401 ||
      status === 403 ||
      (status === 400 && (msg.includes("api key") || msg.includes("apikey") || msg.includes("invalid key") || msg.includes("unauthenticated"))) ||
      msg.includes("invalid_credential") ||
      msg.includes("permission denied")
    ) {
      return "INVALID_CREDENTIAL";
    }

    // 3. Rate Limited (429 / Quota)
    if (
      status === 429 ||
      msg.includes("quota") ||
      msg.includes("rate limit") ||
      msg.includes("rate_limited") ||
      msg.includes("resource_exhausted")
    ) {
      return "RATE_LIMITED";
    }

    // 4. Model Not Found (404 status or specific missing model string)
    if (
      status === 404 ||
      msg.includes("is not found") ||
      msg.includes("unsupported for generatecontent") ||
      (msg.includes("model") && msg.includes("not found")) ||
      (msg.includes("models/") && msg.includes("not found"))
    ) {
      return "MODEL_NOT_FOUND";
    }

    // 5. Invalid Request (400)
    if (status === 400) return "INVALID_REQUEST";

    // 6. Provider Unavailable (5xx or High Demand)
    if (
      (typeof status === "number" && status >= 500) ||
      status === 503 ||
      msg.includes("high demand") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded")
    ) {
      return "PROVIDER_UNAVAILABLE";
    }

    return "UNKNOWN_ERROR";
  }
}