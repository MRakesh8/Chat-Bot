import { GoogleGenAI } from "@google/genai";

const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

// Cooldown map: keyId_modelId -> expiresAt timestamp
const cooldownMap = new Map<string, number>();

function isModelOnCooldown(keyId: string, model: string): boolean {
  const expiresAt = cooldownMap.get(`${keyId}:${model}`);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    cooldownMap.delete(`${keyId}:${model}`);
    return false;
  }
  return true;
}

function setModelCooldown(keyId: string, model: string, seconds = 3600): void {
  const boundedSec = Math.max(30, Math.min(seconds, 86400));
  cooldownMap.set(`${keyId}:${model}`, Date.now() + boundedSec * 1000);
}

function parseGeminiError(err: any): { isQuota: boolean; isModelNotFound: boolean; isAuth: boolean; retryDelay?: number; message: string } {
  const raw = typeof err === "string" ? err : (err?.message || String(err || ""));
  const status = err?.status || err?.response?.status;
  const msgLower = raw.toLowerCase();

  let retryDelay: number | undefined;
  if (raw.includes("retryDelay") || raw.includes("RetryInfo")) {
    const match = raw.match(/(\d+(?:\.\d+)?)\s*s/);
    if (match) retryDelay = Math.round(parseFloat(match[1]));
  }

  const isQuota = status === 429 || msgLower.includes("resource_exhausted") || msgLower.includes("quota") || msgLower.includes("rate limit");
  const isModelNotFound = status === 404 || msgLower.includes("not found") || msgLower.includes("unsupported for generatecontent");
  const isAuth = status === 401 || status === 403 || msgLower.includes("api key") || msgLower.includes("unauthenticated");

  return { isQuota, isModelNotFound, isAuth, retryDelay, message: raw };
}

class GeminiFailoverModels {
  private getClient(apiKey?: string) {
    const key = apiKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    const rawUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    const cleanUrl = rawUrl ? rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '') : undefined;
    return new GoogleGenAI({
      apiKey: key,
      ...(cleanUrl ? { httpOptions: { baseUrl: cleanUrl } } : {})
    });
  }

  private getKeyId(apiKey?: string): string {
    const key = apiKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "default";
    return key.slice(-8);
  }

  async generateContent(userId: string | null, options: any): Promise<any> {
    const client = this.getClient(options.apiKey);
    const keyId = this.getKeyId(options.apiKey);
    const requestedModel = options.model || "gemini-2.5-flash-lite";
    
    // Build candidate model list prioritizing requested model, skipping models on cooldown
    const candidateModels = [
      requestedModel,
      ...GEMINI_MODELS.filter(m => m !== requestedModel)
    ];

    const contents = this.mapOptionsToContents(options);
    const config: any = {
      temperature: options.config?.temperature ?? 0.7,
      maxOutputTokens: options.config?.maxOutputTokens
    };
    if (options.config?.tools) config.tools = options.config.tools;
    if (options.config?.systemInstruction) config.systemInstruction = options.config.systemInstruction;
    if (options.config?.responseMimeType) config.responseMimeType = options.config.responseMimeType;

    let lastError: any = null;
    let triedAny = false;

    for (const model of candidateModels) {
      if (isModelOnCooldown(keyId, model)) {
        continue;
      }

      triedAny = true;
      try {
        const res = await client.models.generateContent({
          model,
          contents,
          config
        });
        return { text: res.text || "" };
      } catch (err: any) {
        lastError = err;
        const { isQuota, isModelNotFound, retryDelay } = parseGeminiError(err);
        
        if (isQuota) {
          setModelCooldown(keyId, model, retryDelay || 3600);
          continue; // Try next model in fallback chain
        } else if (isModelNotFound) {
          setModelCooldown(keyId, model, 86400); // 24hr cooldown on retired/missing models
          continue; // Try next model
        } else {
          // Other errors (e.g. invalid arguments or bad auth) should fail immediately
          throw err;
        }
      }
    }

    if (!triedAny && candidateModels.length > 0) {
      // If all candidate models were on cooldown, reset the first one and try once to prevent permanent deadlock
      try {
        const fallbackModel = candidateModels[0];
        const res = await client.models.generateContent({
          model: fallbackModel,
          contents,
          config
        });
        cooldownMap.delete(`${keyId}:${fallbackModel}`);
        return { text: res.text || "" };
      } catch (err: any) {
        lastError = err;
      }
    }

    const { isQuota, isAuth } = parseGeminiError(lastError);
    const error: any = new Error(
      isQuota
        ? "The AI service is temporarily unavailable because the current AI connection has reached its usage limit. Please try again later."
        : isAuth
        ? "AI service credential is invalid or expired."
        : (lastError?.message || "AI service temporarily unavailable.")
    );
    error.status = isQuota ? 429 : (isAuth ? 401 : 503);
    error.type = isQuota ? "QUOTA_EXCEEDED" : (isAuth ? "INVALID_CREDENTIAL" : "PROVIDER_UNAVAILABLE");
    throw error;
  }

  async generateContentStream(userId: string | null, options: any): Promise<any> {
    const client = this.getClient(options.apiKey);
    const keyId = this.getKeyId(options.apiKey);
    const requestedModel = options.model || "gemini-2.5-flash-lite";

    const candidateModels = [
      requestedModel,
      ...GEMINI_MODELS.filter(m => m !== requestedModel)
    ];

    const contents = this.mapOptionsToContents(options);
    const config: any = {
      temperature: options.config?.temperature ?? 0.7,
      maxOutputTokens: options.config?.maxOutputTokens
    };
    if (options.config?.tools) config.tools = options.config.tools;
    if (options.config?.systemInstruction) config.systemInstruction = options.config.systemInstruction;

    let lastError: any = null;
    let triedAny = false;

    for (const model of candidateModels) {
      if (isModelOnCooldown(keyId, model)) {
        continue;
      }

      triedAny = true;
      try {
        return await client.models.generateContentStream({
          model,
          contents,
          config
        });
      } catch (err: any) {
        lastError = err;
        const { isQuota, isModelNotFound, retryDelay } = parseGeminiError(err);
        
        if (isQuota) {
          setModelCooldown(keyId, model, retryDelay || 3600);
          continue;
        } else if (isModelNotFound) {
          setModelCooldown(keyId, model, 86400);
          continue;
        } else {
          throw err;
        }
      }
    }

    if (!triedAny && candidateModels.length > 0) {
      try {
        const fallbackModel = candidateModels[0];
        const stream = await client.models.generateContentStream({
          model: fallbackModel,
          contents,
          config
        });
        cooldownMap.delete(`${keyId}:${fallbackModel}`);
        return stream;
      } catch (err: any) {
        lastError = err;
      }
    }

    const { isQuota, isAuth } = parseGeminiError(lastError);
    const error: any = new Error(
      isQuota
        ? "The AI service is temporarily unavailable because the current AI connection has reached its usage limit. Please try again later."
        : isAuth
        ? "AI service credential is invalid or expired."
        : (lastError?.message || "AI service temporarily unavailable.")
    );
    error.status = isQuota ? 429 : (isAuth ? 401 : 503);
    error.type = isQuota ? "QUOTA_EXCEEDED" : (isAuth ? "INVALID_CREDENTIAL" : "PROVIDER_UNAVAILABLE");
    throw error;
  }

  async embedContent(userId: string | null, options: any): Promise<any> {
    const client = this.getClient(options.apiKey);
    const model = options.model === "text-embedding-004" ? "gemini-embedding-001" : (options.model || "gemini-embedding-001");
    const contents = options.contents || options.text || "";
    return await client.models.embedContent({
      model,
      contents,
      config: options.config || { outputDimensionality: 768 }
    });
  }

  private mapOptionsToContents(options: any) {
    if (options.contents) {
      if (typeof options.contents === "string") {
        return [{ role: "user", parts: [{ text: options.contents }] }];
      }
      if (Array.isArray(options.contents)) {
        return options.contents.map((item: any) => {
          if (typeof item === "string") return { role: "user", parts: [{ text: item }] };
          if (item.role && item.parts) return item;
          if (item.text) return { role: "user", parts: [{ text: item.text }] };
          if (item.inlineData) return { role: "user", parts: [{ inlineData: item.inlineData }] };
          return item;
        });
      }
      return options.contents;
    }
    if (options.prompt) {
      return [{ role: "user", parts: [{ text: options.prompt }] }];
    }
    return [{ role: "user", parts: [{ text: "" }] }];
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};

