import { GoogleGenAI } from "@google/genai";
import { db, userApiKeys, userApiSettings, projectApiKeys, crypto } from "@workspace/db";
import { eq, and, isNull, asc } from "drizzle-orm";
import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_BASE_URL must be set. Did you forget to provision the Gemini AI integration?",
  );
}

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

// Models for fallback
const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (err: any): boolean => {
  if (!err) return false;
  const status = err?.status || err?.response?.status || err?.code;
  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500 || status === 408) {
    return true;
  }
  const statusStr = String(err?.status || err?.response?.status || err?.code || "").toUpperCase();
  if (statusStr === "UNAVAILABLE" || statusStr === "RESOURCE_EXHAUSTED" || statusStr === "INTERNAL") {
    return true;
  }
  const errMessage = String(err?.message || err?.stack || err).toLowerCase();
  const retryableKeywords = [
    "429", "503", "500", "502", "504",
    "unavailable", "resource_exhausted", "quota", "timeout", "deadline exceeded",
    "rate limit", "overloaded", "too many requests", "service unavailable", "internal server error",
    "spikes in demand", "experiencing high demand", "try again later"
  ];
  return retryableKeywords.some(keyword => errMessage.includes(keyword));
};

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isRetryable = isRetryableError(err);
      if (isRetryable && attempt <= maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[LLM Retry] Attempt ${attempt} failed with retryable error: ${err.message || err}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

import type { GenerateContentResponse, EmbedContentResponse } from "@google/genai";

interface RoutingKey {
  id: string;
  type: 'project' | 'user' | 'system';
  provider: string;
  model?: string;
  encryptedKey: string;
  isPrimary: boolean;
  isEnabled: boolean;
  isSystem: boolean;
  status: string;
  cooldownUntil: Date | null;
  dailyLimit?: number | null;
  dailyUsed?: number;
  totalRequests?: number;
  totalFailures?: number;
  lastResetAt?: Date;
  healthScore: number;
  latencyMs: number;
  lastUsed?: Date | null;
  rawDbKey: any;
}

class GeminiFailoverModels {
  async generateContent(userId: string | null, options: any): Promise<GenerateContentResponse> {
    return this._executeWithRouting(userId, 'generateContent', options) as Promise<GenerateContentResponse>;
  }

  async generateContentStream(userId: string | null, options: any): Promise<AsyncGenerator<GenerateContentResponse, any, any>> {
    return this._executeWithRouting(userId, 'generateContentStream', options) as Promise<AsyncGenerator<GenerateContentResponse, any, any>>;
  }

  async embedContent(userId: string | null, options: any): Promise<EmbedContentResponse> {
    return this._executeWithRouting(userId, 'embedContent', options) as Promise<EmbedContentResponse>;
  }

  private async _fetchAndResetKeys(userId: string | null, projectId?: string | null): Promise<RoutingKey[]> {
    // 1. Fetch Mode
    let mode = "auto";
    if (userId) {
      const settings = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId));
      if (settings.length > 0) mode = settings[0].apiMode;
    }

    // 2. Fetch Keys
    let projectKeys: any[] = [];
    if (projectId) {
      try {
        projectKeys = await db.select().from(projectApiKeys).where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.isEnabled, true)));
      } catch (err) {
        console.error("[Gemini Routing] Failed to fetch project keys:", err);
      }
    }

    let userKeys: any[] = [];
    if (userId) {
       userKeys = await db.select().from(userApiKeys).where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true)));
    }
    let systemKeys = await db.select().from(userApiKeys).where(and(isNull(userApiKeys.userId), eq(userApiKeys.isEnabled, true)));
    
    // Auto-provision system keys from environment if not already in the database
    const envSystemKeys = Array.from(new Set([
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY
    ].filter(Boolean) as string[]));

    if (envSystemKeys.length > 0) {
      let allSystemKeys = await db.select().from(userApiKeys).where(isNull(userApiKeys.userId));
      const decryptedAllSystemKeys = allSystemKeys.map(k => {
        try {
          return crypto.decrypt(k.encryptedKey) || k.encryptedKey;
        } catch {
          return k.encryptedKey;
        }
      });

      const keysToInsert = envSystemKeys.filter(envKey => !decryptedAllSystemKeys.includes(envKey));

      if (keysToInsert.length > 0) {
        for (let i = 0; i < keysToInsert.length; i++) {
          const key = keysToInsert[i];
          try {
            const encryptedKey = crypto.encrypt(key);
            const maskedKey = key.substring(0, 4) + "..." + key.slice(-4);
            
            const [newKey] = await db.insert(userApiKeys).values({
              name: `System Key ${allSystemKeys.length + 1} (Auto-Provisioned)`,
              provider: "gemini",
              encryptedKey: encryptedKey,
              maskedKey: maskedKey,
              isPrimary: allSystemKeys.length === 0 && i === 0,
              isEnabled: true,
              isSystem: true,
              status: "HEALTHY",
              dailyLimit: null
            }).returning();
            
            systemKeys.push(newKey);
            allSystemKeys.push(newKey);
            console.log(`[Gemini Routing] Auto-provisioned system key from environment.`);
          } catch (insertErr) {
            console.error("[Gemini Routing] Failed to auto-provision system key:", insertErr);
          }
        }
      }
    }

    // 3. Reset logic
    const now = new Date();

    // Reset project keys cooldown
    for (const key of projectKeys) {
      if (
        (key.status === "COOLDOWN" || key.status === "QUOTA_EXCEEDED" || key.status === "UNHEALTHY") &&
        key.cooldownUntil &&
        now > key.cooldownUntil
      ) {
        try {
          await db.update(projectApiKeys).set({ status: "HEALTHY", cooldownUntil: null, failureReason: null }).where(eq(projectApiKeys.id, key.id));
          key.status = "HEALTHY";
          key.cooldownUntil = null;
          key.failureReason = null;
        } catch (err) {
          console.error("Failed to reset project key cooldown:", err);
        }
      }
    }

    // Reset user/system keys cooldown and daily limits
    const userSystemKeys = [...userKeys, ...systemKeys];
    for (const key of userSystemKeys) {
       // Reset if it's a new day (simple UTC check for now)
       if (
         key.lastResetAt.getUTCDate() !== now.getUTCDate() ||
         key.lastResetAt.getUTCMonth() !== now.getUTCMonth() ||
         key.lastResetAt.getUTCFullYear() !== now.getUTCFullYear()
       ) {
         try {
           await db.update(userApiKeys).set({
             dailyUsed: 0,
             status: "HEALTHY",
             cooldownUntil: null,
             lastResetAt: now,
             failureReason: null
           }).where(eq(userApiKeys.id, key.id));
           key.dailyUsed = 0;
           key.status = "HEALTHY";
           key.cooldownUntil = null;
           key.lastResetAt = now;
           key.failureReason = null;
         } catch (err) {
           console.error("Failed to reset user/system key daily quota:", err);
         }
       } else if (
         (key.status === "COOLDOWN" || key.status === "QUOTA_EXCEEDED" || key.status === "UNHEALTHY") &&
         key.cooldownUntil &&
         now > key.cooldownUntil
       ) {
         try {
           await db.update(userApiKeys).set({ status: "HEALTHY", cooldownUntil: null, failureReason: null }).where(eq(userApiKeys.id, key.id));
           key.status = "HEALTHY";
           key.cooldownUntil = null;
           key.failureReason = null;
         } catch (err) {
           console.error("Failed to reset user/system key cooldown:", err);
         }
       }
    }

    // Map all keys to RoutingKey objects
    const mappedProjectKeys: RoutingKey[] = projectKeys.map(k => ({
      id: k.id,
      type: 'project',
      provider: k.provider,
      model: k.model || undefined,
      encryptedKey: k.encryptedKey,
      isPrimary: k.isPrimary,
      isEnabled: k.isEnabled,
      isSystem: false,
      status: k.status,
      cooldownUntil: k.cooldownUntil,
      healthScore: k.healthScore || 100,
      latencyMs: k.latencyMs || 0,
      totalRequests: k.totalRequests || 0,
      totalFailures: k.totalFailures || 0,
      lastUsed: k.lastUsed || null,
      rawDbKey: k
    }));

    const mappedUserKeys: RoutingKey[] = userKeys.map(k => ({
      id: k.id,
      type: 'user',
      provider: k.provider,
      encryptedKey: k.encryptedKey,
      isPrimary: k.isPrimary,
      isEnabled: k.isEnabled,
      isSystem: false,
      status: k.status,
      cooldownUntil: k.cooldownUntil,
      dailyLimit: k.dailyLimit,
      dailyUsed: k.dailyUsed,
      totalRequests: k.totalRequests || 0,
      totalFailures: k.totalFailures || 0,
      lastResetAt: k.lastResetAt,
      healthScore: k.healthScore || 100,
      latencyMs: k.latencyMs || 0,
      lastUsed: k.lastUsed || null,
      rawDbKey: k
    }));

    const mappedSystemKeys: RoutingKey[] = systemKeys.map(k => ({
      id: k.id,
      type: 'system',
      provider: k.provider,
      encryptedKey: k.encryptedKey,
      isPrimary: k.isPrimary,
      isEnabled: k.isEnabled,
      isSystem: true,
      status: k.status,
      cooldownUntil: k.cooldownUntil,
      dailyLimit: k.dailyLimit,
      dailyUsed: k.dailyUsed,
      totalRequests: k.totalRequests || 0,
      totalFailures: k.totalFailures || 0,
      lastResetAt: k.lastResetAt,
      healthScore: k.healthScore || 100,
      latencyMs: k.latencyMs || 0,
      lastUsed: k.lastUsed || null,
      rawDbKey: k
    }));

    let allMappedKeys = [...mappedProjectKeys, ...mappedUserKeys, ...mappedSystemKeys];

    // Filter available
    let availableKeys = allMappedKeys.filter(k => k.status === "HEALTHY");

    // Fallback: If no fully HEALTHY keys are available, fall back to trying all enabled keys
    // that are not explicitly marked as INVALID.
    if (availableKeys.length === 0) {
      console.warn("[Gemini Routing] No HEALTHY keys available. Falling back to trying all enabled keys in cooldown/quota status.");
      availableKeys = allMappedKeys.filter(k => k.isEnabled && k.status !== "INVALID");
    }

    // Sort based on health, type, primary status, and least-used (True Round-Robin)
    availableKeys.sort((a, b) => {
      // 1. Prioritize Health Score (Higher is better)
      if (a.healthScore !== b.healthScore) {
        return b.healthScore - a.healthScore;
      }
      
      // 2. Prioritize Project keys -> User keys -> System keys
      const typePriority = { project: 1, user: 2, system: 3 };
      if (typePriority[a.type] !== typePriority[b.type]) {
        return typePriority[a.type] - typePriority[b.type];
      }

      // 3. Fallback sorting based on API mode settings for user vs system
      if (mode === "auto" || mode === "user_first") {
        if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
      } else if (mode === "system_first") {
        if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      }

      // 4. Prioritize Primary keys
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;

      // 5. True Round-Robin (Least-Used Key Selection)
      const aUsage = a.totalRequests || 0;
      const bUsage = b.totalRequests || 0;
      if (aUsage !== bUsage) {
        return aUsage - bUsage;
      }

      // 6. Last Used (Oldest used key goes first if usage count is same)
      const aTime = a.lastUsed ? a.lastUsed.getTime() : 0;
      const bTime = b.lastUsed ? b.lastUsed.getTime() : 0;
      return aTime - bTime;
    });

    return availableKeys;
  }

  private _checkIsDailyLimit(error: any): boolean {
    if (!error) return false;
    const parts: string[] = [];
    if (error.message) parts.push(String(error.message));
    if (error.stack) parts.push(String(error.stack));
    if (typeof error === 'string') parts.push(error);
    try {
      if (error.response) {
        parts.push(typeof error.response === 'string' ? error.response : JSON.stringify(error.response));
      }
      if (error.details) {
        parts.push(typeof error.details === 'string' ? error.details : JSON.stringify(error.details));
      }
      parts.push(JSON.stringify(error));
    } catch (e) {}
    
    const fullErrorText = parts.join(" ").toLowerCase();
    const hasQuotaExceeded = fullErrorText.includes("quota exceeded") || fullErrorText.includes("quota_exceeded") || fullErrorText.includes("exceeded your current quota");
    const isDailyOrFreeLimit = 
      fullErrorText.includes("generaterequestsperday") || 
      fullErrorText.includes("requestsperday") || 
      fullErrorText.includes("daily") || 
      (fullErrorText.includes("free_tier") && fullErrorText.includes("limit: 0")) ||
      (fullErrorText.includes("free-tier") && fullErrorText.includes("limit: 0")) ||
      fullErrorText.includes("check your plan and billing details");
      
    return hasQuotaExceeded && isDailyOrFreeLimit;
  }

  private _calculateCooldown(error: any): number {
    if (this._checkIsDailyLimit(error)) {
      return 720; // 12 hours
    }
    
    const errText = String(error?.message || error).toLowerCase();
    
    // Try to parse retry delay from error message (e.g. "Please retry in 57.061310034s.")
    const match = errText.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
    if (match) {
      const seconds = parseFloat(match[1]);
      return Math.max(1, Math.ceil(seconds / 60));
    }
    
    // Check retry-after header if present (commonly returned by proxies/gateways)
    const retryAfterHeader = error?.response?.headers?.get?.('retry-after');
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        // Cap RPM rate limit cooldown at 2 minutes to prevent starving the key rotation pool
        return Math.min(2, Math.max(1, Math.ceil(seconds / 60)));
      }
    }
    
    return 1; // default 1 minute for other 429 rate limits
  }

  private async _updateKeyFailure(key: RoutingKey, error: any) {
    const now = new Date();
    
    const errMessage = error?.message || String(error);
    const statusStr = error?.status || error?.response?.status || error?.code || 'unknown';
    const errStr = errMessage.toLowerCase();
    
    let cooldownMinutes = 0;
    let status = "COOLDOWN";
    let isEnabled = key.isEnabled;
    
    const is403 = statusStr === '403' || statusStr === 403 || errStr.includes('403') || errStr.includes('permission denied') || errStr.includes('api key not valid');
    const isTimeout = errStr.includes('timeout') || errStr.includes('deadline exceeded');
    const is429 = statusStr === '429' || statusStr === 429 || errStr.includes('429') || errStr.includes('too many requests') || errStr.includes('resource_exhausted') || errStr.includes('quota');
    
    if (is403) {
      status = "INVALID";
      cooldownMinutes = 0;
      isEnabled = false;
    } else if (is429) {
      status = "QUOTA_EXCEEDED";
      cooldownMinutes = this._calculateCooldown(error);
    } else if (isTimeout) {
      status = "COOLDOWN";
      cooldownMinutes = 2;
    } else {
      status = "UNHEALTHY";
      cooldownMinutes = 5;
    }

    const cooldownUntil = cooldownMinutes > 0 ? new Date(now.getTime() + cooldownMinutes * 60000) : null;
    
    const newHealthScore = Math.max(0, key.healthScore - 15); // Drop health significantly on failure
    
    try {
      if (key.type === 'project') {
        await db.update(projectApiKeys).set({
          status,
          cooldownUntil,
          isEnabled,
          failureReason: errMessage,
          lastFailure: now,
          totalFailures: (key.totalFailures || 0) + 1,
          healthScore: newHealthScore
        }).where(eq(projectApiKeys.id, key.id));
      } else {
        await db.update(userApiKeys).set({
          status,
          cooldownUntil,
          isEnabled,
          failureReason: errMessage,
          lastFailure: now,
          totalFailures: (key.totalFailures || 0) + 1,
          totalRequests: (key.totalRequests || 0) + 1,
          healthScore: newHealthScore
        }).where(eq(userApiKeys.id, key.id));
      }
    } catch (err) {
      console.error("Failed to update key failure stats:", err);
    }
  }

  private async _updateKeySuccess(key: RoutingKey, startTimeMs: number) {
    const now = new Date();
    const elapsedMs = Date.now() - startTimeMs;
    const newHealthScore = Math.min(100, key.healthScore + 2); // Slowly recover health
    
    // Calculate new moving average latency (alpha = 0.3)
    const newLatencyMs = key.latencyMs === 0 ? elapsedMs : Math.round(key.latencyMs * 0.7 + elapsedMs * 0.3);
    
    try {
      if (key.type === 'project') {
        await db.update(projectApiKeys).set({
          lastSuccess: now,
          lastUsed: now,
          status: "HEALTHY",
          failureReason: null,
          totalRequests: (key.totalRequests || 0) + 1,
          healthScore: newHealthScore,
          latencyMs: newLatencyMs
        }).where(eq(projectApiKeys.id, key.id));
      } else {
        const newUsed = (key.dailyUsed || 0) + 1;
        let status = "HEALTHY";

        if (key.dailyLimit !== null && key.dailyLimit !== undefined && newUsed >= key.dailyLimit) {
          status = "QUOTA_EXCEEDED";
        }

        await db.update(userApiKeys).set({
          dailyUsed: newUsed,
          lastSuccess: now,
          lastUsed: now,
          totalRequests: (key.totalRequests || 0) + 1,
          status,
          failureReason: null,
          healthScore: newHealthScore,
          latencyMs: newLatencyMs
        }).where(eq(userApiKeys.id, key.id));
      }
    } catch (err) {
      console.error("Failed to update key success stats:", err);
    }
  }

  private async _executeWithRouting(userId: string | null, method: 'generateContent' | 'generateContentStream' | 'embedContent', options: any) {
    const keys = await this._fetchAndResetKeys(userId, options?.projectId);

    if (keys.length === 0) {
      throw { success: false, code: "NO_HEALTHY_KEYS", status: 503, message: "All AI API keys are unavailable. Please add a new API key or wait for quota reset." };
    }

    const originalModel = options.model || "gemini-2.0-flash";
    const modelsToTry = method === 'embedContent' ? [originalModel] : Array.from(new Set([originalModel, ...FALLBACK_MODELS]));
    
    let lastError: any = null;

    for (const key of keys) {
      const decryptedKey = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
      
      let keyFailed = false;
      let allFailuresWereTransient = true;

      for (const modelToUse of modelsToTry) {
        const attemptOptions = { ...options, model: modelToUse };
        
        try {
          const lowerModel = modelToUse.toLowerCase();
          const lowerProvider = key.provider.toLowerCase();
          
          let isModelValid = true;
          if (lowerProvider === "gemini" && !lowerModel.includes("gemini") && !lowerModel.includes("learnlm")) {
            isModelValid = false;
          } else if (lowerProvider !== "gemini" && lowerProvider !== "claude" && (lowerModel.includes("gemini") || lowerModel.includes("learnlm"))) {
            isModelValid = false;
          }
          
          if (!isModelValid) {
            console.error(`[Gemini Routing] Invalid combination: Provider ${key.provider} cannot use model ${modelToUse}. Skipping key.`);
            allFailuresWereTransient = false;
            break; // Move to next key
          }

          let sdkName = "GoogleGenAI";
          let endpointName = "Google Gemini API";
          if (lowerProvider === "claude") {
            sdkName = "Anthropic SDK";
            endpointName = "api.anthropic.com";
          } else if (lowerProvider !== "gemini") {
            sdkName = "OpenAI SDK";
            if (lowerProvider === "groq") endpointName = "api.groq.com/openai/v1";
            else if (lowerProvider === "openrouter") endpointName = "openrouter.ai/api/v1";
            else if (lowerProvider === "deepseek") endpointName = "api.deepseek.com/v1";
            else endpointName = "api.openai.com/v1";
          }
          
          const keySlot = key.isSystem ? `System API ${key.id.substring(0,4)}` : `User API ${key.id.substring(0,4)}`;
          
          console.log(`\n--- Execution Diagnostics ---`);
          console.log(`Selected Provider: ${key.provider}`);
          console.log(`Selected Model: ${modelToUse}`);
          console.log(`Selected SDK: ${sdkName}`);
          console.log(`Selected Endpoint: ${endpointName}`);
          console.log(`Selected API Key: ${keySlot}`);
          console.log(`---------------------------\n`);
          
          const startTimeMs = Date.now();
          let result: any;
          
          if (lowerProvider === "gemini") {
            const client = new GoogleGenAI({
              apiKey: decryptedKey,
              httpOptions: { apiVersion: "", baseUrl: baseUrl }
            });
            if (method === 'generateContent') {
              result = await executeWithRetry(() => client.models.generateContent(attemptOptions));
            } else if (method === 'generateContentStream') {
              result = await executeWithRetry(() => client.models.generateContentStream(attemptOptions));
            } else if (method === 'embedContent') {
              result = await executeWithRetry(() => client.models.embedContent(attemptOptions as any));
            }
          } else if (lowerProvider === "claude") {
            if (method === 'embedContent') throw new Error("Anthropic does not support embedding directly in this wrapper");
            const client = new Anthropic({ apiKey: decryptedKey });
            const chatMessages = (attemptOptions.contents || []).map((m: any) => ({
              role: m.role === 'model' ? 'assistant' : 'user',
              content: m.parts?.[0]?.text || m.content || ""
            }));
            const systemInst = attemptOptions.config?.systemInstruction?.parts?.[0]?.text;
            
            if (method === 'generateContent') {
              const res = await executeWithRetry(() => client.messages.create({
                model: modelToUse,
                system: systemInst,
                messages: chatMessages,
                temperature: attemptOptions.config?.temperature ?? 0.7,
                max_tokens: attemptOptions.config?.maxOutputTokens || 4096
              }));
              result = { text: res.content[0]?.type === 'text' ? res.content[0].text : "" };
            } else {
              const stream = await executeWithRetry(() => client.messages.create({
                model: modelToUse,
                system: systemInst,
                messages: chatMessages,
                temperature: attemptOptions.config?.temperature ?? 0.7,
                max_tokens: attemptOptions.config?.maxOutputTokens || 4096,
                stream: true
              }));
              result = (async function*() {
                for await (const chunk of stream) {
                  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    yield { text: chunk.delta.text };
                  }
                }
              })();
            }
          } else {
            if (method === 'embedContent') throw new Error("OpenAI compatible does not support embedding directly in this wrapper");
            const baseURL = "https://" + endpointName;
            const client = new OpenAI({ apiKey: decryptedKey, baseURL });
            const chatMessages = (attemptOptions.contents || []).map((m: any) => ({
              role: m.role === 'model' ? 'assistant' : 'user',
              content: m.parts?.[0]?.text || m.content || ""
            }));
            const systemInst = attemptOptions.config?.systemInstruction?.parts?.[0]?.text;
            if (systemInst) chatMessages.unshift({ role: 'system', content: systemInst });
            
            if (method === 'generateContent') {
              const res = await executeWithRetry(() => client.chat.completions.create({
                model: modelToUse,
                messages: chatMessages,
                temperature: attemptOptions.config?.temperature ?? 0.7,
                max_tokens: attemptOptions.config?.maxOutputTokens
              }));
              result = { text: res.choices[0]?.message?.content || "" };
            } else {
              const stream = await executeWithRetry(() => client.chat.completions.create({
                model: modelToUse,
                messages: chatMessages,
                temperature: attemptOptions.config?.temperature ?? 0.7,
                max_tokens: attemptOptions.config?.maxOutputTokens,
                stream: true
              }));
              result = (async function*() {
                for await (const chunk of stream) {
                  if (chunk.choices[0]?.delta?.content) {
                    yield { text: chunk.choices[0].delta.content };
                  }
                }
              })();
            }
          }

          await this._updateKeySuccess(key, startTimeMs);
          return result;
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.response?.status || 'unknown';
          const isTimeout = err?.message?.toLowerCase().includes("timeout");
          const keySlot = key.isSystem ? `System API ${key.id.substring(0,4)}` : `User API ${key.id.substring(0,4)}`;
          
          const logOutput = `Provider: ${key.provider}\nModel: ${modelToUse}\nKey Slot: ${keySlot}\nHTTP Status: ${status}\nError: ${err.message}\n----------------------------------------`;
          
          const is5xx = status === 503 || status === 500 || status === 502 || status === 504 ||
                        err?.message?.includes("503") || err?.message?.includes("500") ||
                        err?.message?.includes("502") || err?.message?.includes("504");

          if (!is5xx) {
            allFailuresWereTransient = false;
          }

          if (status === 429) {
            console.warn(`[Gemini Routing] Rate Limit:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else if (status === 403) {
            console.error(`[Gemini Routing] Permission Denied:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else if (isTimeout) {
            console.warn(`[Gemini Routing] Timeout:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else if (
            status === 503 || status === 404 || status === 500 || status === 502 || status === 504 ||
            err?.message?.includes("503") || err?.message?.includes("404") ||
            err?.message?.includes("500") || err?.message?.includes("502") || err?.message?.includes("504")
          ) {
            console.warn(`[Gemini Routing] Model/Server Error (Status ${status}): Trying fallback model...\n${logOutput}`);
            continue; // Try next fallback model for the SAME key
          } else if (isRetryableError(err)) {
            console.warn(`[Gemini Routing] Retryable Error:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else {
            console.error(`[Gemini Routing] Non-Retryable Error:\n${logOutput}`);
            throw err;
          }
        }
      }

      if (!keyFailed) {
        if (allFailuresWereTransient) {
          console.warn(`[Gemini Routing] Key ${key.id.substring(0,4)} failed all models due to transient server load/outage. Skipping database unhealthy lock.`);
        } else {
          await this._updateKeyFailure(key, new Error("All models failed to respond (including fallbacks)"));
        }
      }
    }

    console.error(`[Gemini Routing] All available keys failed or no keys available. Returning structured NO_HEALTHY_KEYS error. Last error:`, lastError?.message || lastError);
    
    const isLast5xx = lastError?.status === 503 || lastError?.status === 502 || lastError?.status === 504 ||
                      lastError?.message?.includes("503") || lastError?.message?.includes("502") || lastError?.message?.includes("504");
    const isLast429 = lastError?.status === 429 || lastError?.message?.includes("429");

    throw {
      success: false,
      code: isLast5xx ? "SERVICE_UNAVAILABLE" : (isLast429 ? "QUOTA_EXCEEDED" : "NO_HEALTHY_KEYS"),
      status: isLast5xx ? 503 : (isLast429 ? 429 : 503),
      message: isLast5xx 
        ? "AI service is currently experiencing high demand. Please try again in a few seconds." 
        : (isLast429 
            ? "AI service quota exceeded. Please wait for quota reset." 
            : "All AI API keys are unavailable. Please add a new API key or wait for quota reset.")
    };
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};
