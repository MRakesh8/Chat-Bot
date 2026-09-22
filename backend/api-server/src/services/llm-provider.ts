import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export interface ProviderConfig {
  provider: "gemini" | "openai" | "claude" | "groq" | "deepseek" | "openrouter" | string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class UniversalProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { provider } = this.config;
    
    switch (provider.toLowerCase()) {
      case "gemini":
        return this.handleGemini(request);
      case "openai":
      case "groq":
      case "deepseek":
      case "openrouter":
        return this.handleOpenAICompatible(request);
      case "claude":
        return this.handleClaude(request);
      default:
        // Try OpenAI compatible as fallback
        return this.handleOpenAICompatible(request);
    }
  }

  async *generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    const { provider } = this.config;
    
    switch (provider.toLowerCase()) {
      case "gemini":
        yield* this.handleGeminiStream(request);
        break;
      case "openai":
      case "groq":
      case "deepseek":
      case "openrouter":
        yield* this.handleOpenAICompatibleStream(request);
        break;
      case "claude":
        yield* this.handleClaudeStream(request);
        break;
      default:
        yield* this.handleOpenAICompatibleStream(request);
    }
  }

  private getOpenAIBaseUrl(provider: string): string | undefined {
    if (this.config.baseUrl) return this.config.baseUrl;
    switch (provider.toLowerCase()) {
      case "openai": return "https://api.openai.com/v1";
      case "groq": return "https://api.groq.com/openai/v1";
      case "deepseek": return "https://api.deepseek.com/v1";
      case "openrouter": return "https://openrouter.ai/api/v1";
      default: return undefined;
    }
  }

  private async handleOpenAICompatible(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const baseURL = this.getOpenAIBaseUrl(this.config.provider);
    const client = new OpenAI({ apiKey: this.config.apiKey, baseURL });

    const response = await client.chat.completions.create({
      model: this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens
    });

    const resultObj = {
      content: response.choices[0]?.message?.content || "",
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      }
    };
    return resultObj;
  }

  private async *handleOpenAICompatibleStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    const baseURL = this.getOpenAIBaseUrl(this.config.provider);
    const client = new OpenAI({ apiKey: this.config.apiKey, baseURL });

    const stream = await client.chat.completions.create({
      model: this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: true
    });

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        yield { text: chunk.choices[0].delta.content };
      }
    }
  }

  private getHttpOptions(baseUrl?: string): any {
    const rawUrl = baseUrl || process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    if (rawUrl) {
      const cleanUrl = rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
      if (cleanUrl) return { baseUrl: cleanUrl };
    }
    return undefined;
  }

  private async handleGemini(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const httpOptions = this.getHttpOptions(this.config.baseUrl);
    
    const client = new GoogleGenAI({ apiKey: this.config.apiKey, ...(httpOptions ? { httpOptions } : {}) });
    let actualModel = this.config.model;
    if (actualModel === "gemini-1.5-flash") actualModel = "gemini-2.0-flash";

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

    const response = await client.models.generateContent({
      model: actualModel,
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
  }

  private async *handleGeminiStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    const httpOptions = this.getHttpOptions(this.config.baseUrl);
    
    const client = new GoogleGenAI({ apiKey: this.config.apiKey, ...(httpOptions ? { httpOptions } : {}) });
    let actualModel = this.config.model;
    if (actualModel === "gemini-1.5-flash") actualModel = "gemini-2.0-flash";

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

    const stream = await client.models.generateContentStream({
      model: actualModel,
      ...body
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield { text: chunk.text };
      }
    }
  }

  private async handleClaude(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const baseURL = this.config.baseUrl || "https://api.anthropic.com";
    const client = new Anthropic({ apiKey: this.config.apiKey, baseURL });

    const systemMessage = request.messages.find(m => m.role === "system")?.content;
    const chatMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content
    }));

    const response = await client.messages.create({
      model: this.config.model,
      system: systemMessage,
      messages: chatMessages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens || 4096
    });

    return {
      content: response.content[0]?.type === "text" ? response.content[0].text : "",
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      }
    };
  }

  private async *handleClaudeStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    const baseURL = this.config.baseUrl || "https://api.anthropic.com";
    const client = new Anthropic({ apiKey: this.config.apiKey, baseURL });

    const systemMessage = request.messages.find(m => m.role === "system")?.content;
    const chatMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content
    }));

    const stream = await client.messages.create({
      model: this.config.model,
      system: systemMessage,
      messages: chatMessages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens || 4096,
      stream: true
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield { text: chunk.delta.text };
      }
    }
  }
}
