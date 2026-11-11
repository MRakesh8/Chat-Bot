import { GoogleGenAI } from "@google/genai";
import nodeCrypto from "crypto";
import { BaseProviderAdapter, ChatCompletionRequest, ChatCompletionResponse } from "./base";
import { NormalizedModel } from "../types";

const MAX_CLIENT_CACHE = 100;
const geminiClientCache = new Map<string, GoogleGenAI>();

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

  private getClient(apiKey: string, baseUrl?: string): GoogleGenAI {
    const httpOptions = this.getHttpOptions(baseUrl);
    const keyHash = nodeCrypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
    const cacheKey = `${keyHash}:${httpOptions?.baseUrl || "default"}`;
    let client = geminiClientCache.get(cacheKey);
    if (!client) {
      if (geminiClientCache.size >= MAX_CLIENT_CACHE) {
        const oldestKey = geminiClientCache.keys().next().value;
        if (oldestKey) geminiClientCache.delete(oldestKey);
      }
      client = new GoogleGenAI({ apiKey, ...(httpOptions ? { httpOptions } : {}) });
      geminiClientCache.set(cacheKey, client);
    }
    return client;
  }

  private buildRequestConfig(request: ChatCompletionRequest) {
    const contents = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const systemInstruction = request.messages.find(m => m.role === "system")?.content;
    const config: any = {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens
    };
    if (systemInstruction) {
      config.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (request.signal) {
      config.abortSignal = request.signal;
    }
    if (request.disableThinking && /^gemini-2\.5-flash/i.test(request.model.modelId)) {
      config.thinkingConfig = { thinkingBudget: 0 };
    }
    return { contents, config };
  }

  async discoverModels(apiKey: string, baseUrl?: string, signal?: AbortSignal): Promise<NormalizedModel[]> {
    const rawUrl = baseUrl || process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
    const cleanUrl = rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
    const timeoutSignal = AbortSignal.timeout(5000);
    const combinedSignal = signal
      ? (typeof (AbortSignal as any).any === "function" ? (AbortSignal as any).any([signal, timeoutSignal]) : signal)
      : timeoutSignal;

    const response = await fetch(`${cleanUrl}/v1beta/models?key=${apiKey}`, { signal: combinedSignal });
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
    if (request.signal?.aborted) {
      throw new Error("Request was aborted");
    }

    const client = this.getClient(request.model.credential.apiKey, request.model.credential.baseUrl);
    const body = this.buildRequestConfig(request);

    try {
      const response = await client.models.generateContent({
        model: request.model.modelId,
        ...body
      });

      if (request.signal?.aborted) {
        throw new Error("Request was aborted");
      }

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
    if (request.signal?.aborted) {
      return;
    }
    const client = this.getClient(request.model.credential.apiKey, request.model.credential.baseUrl);
    const body = this.buildRequestConfig(request);

    try {
      const stream = await client.models.generateContentStream({
        model: request.model.modelId,
        ...body
      });
      for await (const chunk of stream) {
        if (request.signal?.aborted) break;
        if (chunk.text) yield { text: chunk.text };
      }
    } catch (e: any) {
      if (request.signal?.aborted) return;
      throw e;
    }
  }

  classifyError(error: any): any {
    if (!error) return "UNKNOWN_ERROR";
    const status = error?.status || error?.response?.status || error?.code || error?.error?.code;
    const gRpcStatus = (error?.error?.status || error?.status || "").toString().toUpperCase();
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

    // 2. Invalid Credential (401 / 403 / Bad Key / gRPC Permission Denied)
    if (
      status === 401 ||
      status === 403 ||
      status === "401" ||
      status === "403" ||
      gRpcStatus === "PERMISSION_DENIED" ||
      gRpcStatus === "UNAUTHENTICATED" ||
      (status === 400 && (msg.includes("api key") || msg.includes("apikey") || msg.includes("invalid key") || msg.includes("unauthenticated"))) ||
      msg.includes("invalid_credential") ||
      msg.includes("permission denied")
    ) {
      return "INVALID_CREDENTIAL";
    }

    // 3. Rate Limited (429 / Quota / gRPC Resource Exhausted)
    if (
      status === 429 ||
      status === "429" ||
      gRpcStatus === "RESOURCE_EXHAUSTED" ||
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
      status === "404" ||
      gRpcStatus === "NOT_FOUND" ||
      msg.includes("is not found") ||
      msg.includes("unsupported for generatecontent") ||
      (msg.includes("model") && msg.includes("not found")) ||
      (msg.includes("models/") && msg.includes("not found"))
    ) {
      return "MODEL_NOT_FOUND";
    }

    // 5. Invalid Request (400)
    if (status === 400 || status === "400") return "INVALID_REQUEST";

    // 6. Provider Unavailable (5xx, 503, UNAVAILABLE, or High Demand)
    if (
      (typeof status === "number" && status >= 500) ||
      status === 503 ||
      status === "503" ||
      gRpcStatus === "UNAVAILABLE" ||
      msg.includes("high demand") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded")
    ) {
      return "PROVIDER_UNAVAILABLE";
    }

    return "UNKNOWN_ERROR";
  }
}