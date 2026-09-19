import { BaseProviderAdapter } from "./providers/base";
import { GeminiAdapter } from "./providers/gemini-adapter";
import { OpenAIAdapter } from "./providers/openai-adapter";

class ProviderRegistry {
  private adapters: Map<string, BaseProviderAdapter> = new Map();

  constructor() {
    this.register(new GeminiAdapter());
    this.register(new OpenAIAdapter());
    // Add others (Anthropic, OpenRouter, Groq) as needed
  }

  register(adapter: BaseProviderAdapter) {
    this.adapters.set(adapter.providerId.toLowerCase(), adapter);
  }

  getAdapter(providerId: string): BaseProviderAdapter {
    const adapter = this.adapters.get(providerId.toLowerCase());
    if (!adapter) {
      throw new Error(`Unsupported AI Provider: ${providerId}`);
    }
    return adapter;
  }
}

export const registry = new ProviderRegistry();