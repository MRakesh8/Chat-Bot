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

  private getOpenAIBaseUrl(provider: string): string {
    if (this.config.baseUrl) return this.config.baseUrl;
    switch (provider.toLowerCase()) {
      case "openai": return "https://api.openai.com/v1";
      case "groq": return "https://api.groq.com/openai/v1";
      case "deepseek": return "https://api.deepseek.com/v1";
      case "openrouter": return "https://openrouter.ai/api/v1";
      default: return "https://api.openai.com/v1";
    }
  }

  private async handleOpenAICompatible(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const baseUrl = this.getOpenAIBaseUrl(this.config.provider);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${this.config.provider} API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as any;
    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      }
    };
  }

  private async handleGemini(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const baseUrl = this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    let actualModel = this.config.model;
    if (actualModel === "gemini-1.5-flash") {
      actualModel = "gemini-2.5-flash"; // Upgrade deprecated model
    }
    
    // Convert to Gemini format
    const contents = request.messages.map(m => ({
      role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : "user",
      parts: [{ text: m.content }]
    }));

    const systemInstruction = request.messages.find(m => m.role === "system")?.content;
    const body: any = {
      contents: contents.filter(c => request.messages.find(m => m.content === c.parts[0].text)?.role !== "system"),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens
      }
    };

    if (systemInstruction) {
        body.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    const response = await fetch(`${baseUrl}/models/${actualModel}:generateContent?key=${this.config.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as any;
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;

    return {
      content,
      usage: { promptTokens, completionTokens, totalTokens }
    };
  }

  private async handleClaude(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const baseUrl = this.config.baseUrl || "https://api.anthropic.com/v1";
    const systemMessage = request.messages.find(m => m.role === "system")?.content;
    const chatMessages = request.messages.filter(m => m.role !== "system");

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.config.model,
        system: systemMessage,
        messages: chatMessages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as any;
    return {
      content: data.content?.[0]?.text || "",
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      }
    };
  }
}
