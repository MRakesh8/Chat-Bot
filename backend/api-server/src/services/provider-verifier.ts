import { GoogleGenAI } from "@google/genai";
// Rely on native fetch since Node >= 18 has it

export interface VerifiedProvider {
  provider: string;
  defaultModel: string;
  models: string[];
}

export class ProviderVerifier {
  /**
   * Detects the provider based on the API key prefix.
   */
  static detectProvider(apiKey: string): string | null {
    const key = apiKey.trim();
    if (key.startsWith("gsk_")) return "groq";
    if (key.startsWith("sk-ant-")) return "claude";
    if (key.startsWith("sk-or-")) return "openrouter";
    if (key.startsWith("AIza")) return "gemini";
    if (key.startsWith("sk-proj-") || key.startsWith("sk-")) return "openai";
    return null;
  }

  /**
   * Identifies the provider and fetches available models using their native APIs.
   * Throws an error if the key is invalid or quota is exhausted.
   */
  static async verifyAndFetchModels(apiKey: string, forceProvider?: string): Promise<VerifiedProvider> {
    const provider = forceProvider || this.detectProvider(apiKey);
    
    if (!provider) {
      try { return await this.verifyGemini(apiKey); } catch (e) {}
      try { return await this.verifyOpenAI(apiKey); } catch (e) {}
      try { return await this.verifyClaude(apiKey); } catch (e) {}
      try { return await this.verifyGroq(apiKey); } catch (e) {}
      try { return await this.verifyOpenRouter(apiKey); } catch (e) {}
      
      throw new Error("Unable to automatically detect the AI provider from this API key. Please ensure it is a valid Groq, Gemini, OpenAI, Anthropic, or OpenRouter key.");
    }

    switch (provider) {
      case "gemini":
        return await this.verifyGemini(apiKey);
      case "groq":
        return await this.verifyGroq(apiKey);
      case "openai":
        return await this.verifyOpenAI(apiKey);
      case "claude":
        return await this.verifyClaude(apiKey);
      case "openrouter":
        return await this.verifyOpenRouter(apiKey);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private static async verifyGemini(apiKey: string): Promise<VerifiedProvider> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) throw new Error("Invalid Gemini API key.");
        throw new Error(`Gemini API Error: ${response.status}`);
      }
      const data = await response.json() as any;
      const models = data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: any) => m.name.replace("models/", ""));
        
      return {
        provider: "gemini",
        defaultModel: models.includes("gemini-2.0-flash") ? "gemini-2.0-flash" : models.includes("gemini-1.5-flash") ? "gemini-1.5-flash" : models[0],
        models
      };
    } catch (e: any) {
      throw new Error(e.message || "Failed to verify Gemini API key.");
    }
  }

  private static async verifyGroq(apiKey: string): Promise<VerifiedProvider> {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Invalid Groq API key.");
        throw new Error(`Groq API Error: ${response.statusText}`);
      }
      const data = await response.json() as any;
      const models = data.data.map((m: any) => m.id);
      
      return {
        provider: "groq",
        defaultModel: models.includes("llama3-8b-8192") ? "llama3-8b-8192" : models[0],
        models
      };
    } catch (e: any) {
      throw new Error(e.message || "Failed to verify Groq API key.");
    }
  }

  private static async verifyOpenAI(apiKey: string): Promise<VerifiedProvider> {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Invalid OpenAI API key.");
        throw new Error(`OpenAI API Error: ${response.statusText}`);
      }
      const data = await response.json() as any;
      const models = data.data.filter((m: any) => m.id.startsWith("gpt-") || m.id.startsWith("o1") || m.id.startsWith("o3")).map((m: any) => m.id);
      
      return {
        provider: "openai",
        defaultModel: models.includes("gpt-4o-mini") ? "gpt-4o-mini" : models.includes("gpt-4o") ? "gpt-4o" : models[0],
        models
      };
    } catch (e: any) {
      throw new Error(e.message || "Failed to verify OpenAI API key.");
    }
  }

  private static async verifyClaude(apiKey: string): Promise<VerifiedProvider> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Invalid Anthropic API key.");
        throw new Error(`Anthropic API Error: ${response.statusText}`);
      }
      const data = await response.json() as any;
      const models = data.data.map((m: any) => m.id);
      
      return {
        provider: "claude",
        defaultModel: models.includes("claude-3-5-sonnet-20241022") ? "claude-3-5-sonnet-20241022" : models[0],
        models
      };
    } catch (e: any) {
      throw new Error(e.message || "Failed to verify Anthropic API key.");
    }
  }

  private static async verifyOpenRouter(apiKey: string): Promise<VerifiedProvider> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) {
        throw new Error(`OpenRouter API Error: ${response.statusText}`);
      }
      
      // auth check using openrouter key endpoint
      const authCheck = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!authCheck.ok) {
         throw new Error("Invalid OpenRouter API key.");
      }

      const data = await response.json() as any;
      
      // Filter massive openrouter list to top reliable providers
      const models = data.data
        .filter((m: any) => m.id.startsWith("google/") || m.id.startsWith("anthropic/") || m.id.startsWith("openai/") || m.id.startsWith("meta-llama/"))
        .map((m: any) => m.id);
      
      return {
        provider: "openrouter",
        defaultModel: models.includes("google/gemini-2.0-flash-exp:free") ? "google/gemini-2.0-flash-exp:free" : models[0],
        models
      };
    } catch (e: any) {
      throw new Error(e.message || "Failed to verify OpenRouter API key.");
    }
  }
}
