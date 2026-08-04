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
const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-exp"];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (err: any): boolean => {
  if (!err) return false;
  const status = err?.status || err?.response?.status || err?.code;
  // Note: 429 and RESOURCE_EXHAUSTED are NOT here. They should bubble up immediately
  // to the router so it can failover to the next available API key.
  if (status === 503 || status === 502 || status === 504 || status === 500 || status === 408) {
    return true;
  }
  const statusStr = String(err?.status || err?.response?.status || err?.code || "").toUpperCase();
  if (statusStr === "UNAVAILABLE" || statusStr === "INTERNAL") {
    return true;
  }
  const errMessage = String(err?.message || err?.stack || err).toLowerCase();
  const retryableKeywords = [
    "503", "500", "502", "504",
    "unavailable", "timeout", "deadline exceeded",
    "overloaded", "service unavailable", "internal server error",
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
    
    // Auto-provision & sync system keys from environment variables
    const envKeys = [
      { key: process.env.AI_INTEGRATIONS_GEMINI_API_KEY, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY_1, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY_2, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY_3, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY, provider: "gemini" },
      { key: process.env.OPENROUTER_API_KEY, provider: "openrouter" },
      { key: process.env.OPENROUTER_KEY, provider: "openrouter" },
      { key: process.env.GROQ_API_KEY, provider: "groq" }
    ].filter(k => !!k.key) as { key: string, provider: string }[];

    let allDbSystemKeys = await db.select().from(userApiKeys).where(isNull(userApiKeys.userId));

    // Purge old system keys from DB that are no longer in environment variables
    if (envKeys.length > 0) {
      const envKeyStrings = envKeys.map(k => k.key);
      for (const sysKey of allDbSystemKeys) {
        let decrypted = "";
        try { decrypted = crypto.decrypt(sysKey.encryptedKey) || sysKey.encryptedKey; } catch { decrypted = sysKey.encryptedKey; }
        if (!envKeyStrings.includes(decrypted)) {
          try {
            console.log(`[Gemini Routing] Purging outdated system key ${sysKey.id.substring(0,4)} (removed from env).`);
            await db.delete(userApiKeys).where(eq(userApiKeys.id, sysKey.id));
          } catch (delErr) {
            console.error("[Gemini Routing] Failed to purge outdated system key:", delErr);
          }
        }
      }
      
      // Refresh list of DB system keys
      allDbSystemKeys = await db.select().from(userApiKeys).where(isNull(userApiKeys.userId));
      const decryptedAllSystemKeys = allDbSystemKeys.map(k => {
        try { return crypto.decrypt(k.encryptedKey) || k.encryptedKey; } catch { return k.encryptedKey; }
      });

      const keysToInsert = envKeys.filter(envK => !decryptedAllSystemKeys.includes(envK.key));

      if (keysToInsert.length > 0) {
        for (let i = 0; i < keysToInsert.length; i++) {
          const item = keysToInsert[i];
          try {
            const encryptedKey = crypto.encrypt(item.key);
            const maskedKey = item.provider === "gemini" 
              ? `AIza****${item.key.slice(-4)}`
              : `${item.provider.toUpperCase()}****${item.key.slice(-4)}`;
            
            const [newKey] = await db.insert(userApiKeys).values({
              name: `System Key ${allDbSystemKeys.length + 1} (${item.provider.toUpperCase()} Auto-Provisioned)`,
              provider: item.provider,
              encryptedKey: encryptedKey,
              maskedKey: maskedKey,
              isPrimary: allDbSystemKeys.length === 0 && i === 0,
              isEnabled: true,
              isSystem: true,
              status: "HEALTHY",
              dailyLimit: null,
              availableModels: item.provider === "openrouter"
                ? ["google/gemini-2.0-flash-exp:free", "meta-llama/llama-3.3-70b-instruct:free"]
                : item.provider === "groq"
                  ? ["llama-3.3-70b-specdec"]
                  : ["gemini-2.0-flash", "gemini-2.0-flash-lite"]
            }).returning();
            
            allDbSystemKeys.push(newKey);
            console.log(`[Gemini Routing] Auto-provisioned new system key (${item.provider}) from environment.`);
          } catch (insertErr) {
            console.error("[Gemini Routing] Failed to auto-provision system key:", insertErr);
          }
        }
      }

      systemKeys = allDbSystemKeys.filter(k => k.isEnabled);
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

    // Sort based on health, type, primary status, and least-used (True Round-Robin)
    // Sort based on type (Project -> User -> System), primary flag, health, and least-used
    availableKeys.sort((a, b) => {
      // 1. Strict priority: Project Keys -> User Keys -> System Keys
      const typePriority: Record<string, number> = { project: 1, user: 2, system: 3 };
      
      // If mode is "system_first", swap priority for user vs system (Project key is still #1)
      if (mode === "system_first") {
        typePriority.user = 3;
        typePriority.system = 2;
      }

      if (typePriority[a.type] !== typePriority[b.type]) {
        return typePriority[a.type] - typePriority[b.type];
      }

      // 2. Prioritize Primary flag within the same group
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;

      // 3. Prioritize Health Score within the same group (Higher is better)
      if (a.healthScore !== b.healthScore) {
        return b.healthScore - a.healthScore;
      }

      // 4. True Round-Robin (Least-Used Key Selection within same priority level)
      const aUsage = a.totalRequests || 0;
      const bUsage = b.totalRequests || 0;
      if (aUsage !== bUsage) {
        return aUsage - bUsage;
      }

      // 5. Last Used (Oldest used key goes first if usage count is same)
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
    let keys: any[] = [];
    let lastError: any = null;

    try {
      keys = await this._fetchAndResetKeys(userId, options?.projectId);
    } catch (fetchErr) {
      console.error("[Gemini Routing] Failed to fetch routing keys:", fetchErr);
      lastError = fetchErr;
    }

    const originalModel = options.model || "gemini-2.0-flash";

    for (const key of keys) {
      const decryptedKey = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
      
      let keyFailed = false;
      let allFailuresWereTransient = true;

      // Build a per-key model list using what this key actually supports.
      // This respects the availableModels fetched when the key was registered
      // so we only try models that are accessible on that key's project/tier.
      let keyModels: string[] = [];
      if (method === 'embedContent') {
        keyModels = [originalModel];
      } else {
        const rawStored: string[] = (key as any).rawDbKey?.availableModels ?? [];
        const stored = rawStored.filter((m: string) => {
          const lower = m.toLowerCase();
          return !lower.includes("-tts") && !lower.includes("-audio") && !lower.includes("-imagen") && !lower.includes("embed") && !lower.includes("-realtime") && !lower.includes("-bison");
        });
        if (stored.length > 0) {
          // Start with the requested model if it's in the available list, else start with the first available
          const preferred = stored.includes(originalModel) ? originalModel : stored[0];
          // Deduplicate: preferred first, then the rest of stored, then global fallbacks for any gaps
          keyModels = Array.from(new Set([preferred, ...stored, ...FALLBACK_MODELS]));
        } else {
          // No stored models — fall back to hardcoded list
          keyModels = Array.from(new Set([originalModel, ...FALLBACK_MODELS]));
        }
      }

      for (const modelToUse of keyModels) {
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
            console.error(`[Gemini Routing] Invalid combination: Provider ${key.provider} cannot use model ${modelToUse}. Skipping model.`);
            allFailuresWereTransient = false;
            continue; // Skip this model and check next fallback
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
            
            const rawMaxTokens = attemptOptions.config?.maxOutputTokens;
            // Cap max_tokens to 2048 for OpenRouter and Groq to avoid 402 credits error on free tier
            const maxTokensToUse = (lowerProvider === "openrouter" || lowerProvider === "groq")
              ? (rawMaxTokens ? Math.min(rawMaxTokens, 2048) : 2048)
              : rawMaxTokens;

            if (method === 'generateContent') {
              const res = await executeWithRetry(() => client.chat.completions.create({
                model: modelToUse,
                messages: chatMessages,
                temperature: attemptOptions.config?.temperature ?? 0.7,
                max_tokens: maxTokensToUse
              }));
              result = { text: res.choices[0]?.message?.content || "" };
            } else {
              const stream = await executeWithRetry(() => client.chat.completions.create({
                model: modelToUse,
                messages: chatMessages,
                temperature: attemptOptions.config?.temperature ?? 0.7,
                max_tokens: maxTokensToUse,
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
            // Check if this is a permanent limit 0 for this specific model rather than overall exhaustion
            if (err?.message?.includes("limit: 0")) {
              console.warn(`[Gemini Routing] Model ${modelToUse} is not available on this tier (limit 0). Trying next fallback model...`);
              allFailuresWereTransient = false; // Track that this is a key-level quota issue
              continue;
            }
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
            status === 503 || status === 404 || status === 500 || status === 502 || status === 504 || status === 400 || status === 422 ||
            err?.message?.includes("503") || err?.message?.includes("404") || err?.message?.includes("400") ||
            err?.message?.includes("500") || err?.message?.includes("502") || err?.message?.includes("504") ||
            err?.message?.includes("Multiturn chat") || err?.message?.includes("not enabled") || err?.message?.includes("INVALID_ARGUMENT")
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
          // If ALL models hit limit:0, this is a quota exhaustion on the key itself — mark it properly
          const allLimitZero = lastError?.message?.includes("limit: 0");
          if (allLimitZero) {
            console.warn(`[Gemini Routing] Key ${key.id.substring(0,4)} exhausted: all models have limit:0 on free tier. Marking as QUOTA_EXCEEDED.`);
            await this._updateKeyFailure(key, { ...lastError, status: 429 });
          } else {
            await this._updateKeyFailure(key, new Error("All models failed to respond (including fallbacks)"));
          }
        }
      }
    }

    // --- OpenRouter Fallback ---
    const fallbackEnabled = options.fallbackEnabled !== false;
    const openrouterKey = options.fallbackKey || process.env.openapi || process.env.OPENAPI;
    if (fallbackEnabled && openrouterKey && method !== 'embedContent') {
      console.warn(`[Gemini Routing] Fallback triggered! All Gemini keys failed or none available. Trying OpenRouter fallback...`);
      
      const fallbackModels = [
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "qwen/qwen3-next-80b-a3b-instruct:free",
        "z-ai/glm-4.5-air:free",
        "openai/gpt-oss-20b:free",
        "google/gemma-3n-e2b-it:free",
        "cognitivecomputations/dolphin-mistral-24b-venice-edition:free"
      ];

      const client = new OpenAI({
        apiKey: openrouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        timeout: 45000,
        defaultHeaders: {
          "HTTP-Referer": "https://localhost",
          "X-Title": "RAGHUB"
        }
      });

      const chatMessages = (options.contents || []).map((m: any) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.parts?.[0]?.text || m.content || ""
      }));
      const systemInst = options.config?.systemInstruction?.parts?.[0]?.text;
      if (systemInst) {
        chatMessages.unshift({ role: 'system', content: systemInst });
      }

      for (const modelId of fallbackModels) {
        try {
          console.log(`[Gemini Routing Fallback] Trying OpenRouter model ${modelId}...`);
          if (method === 'generateContent') {
            const res = await client.chat.completions.create({
              model: modelId,
              messages: chatMessages,
              temperature: options.config?.temperature ?? 0.7,
              max_tokens: options.config?.maxOutputTokens ? Math.min(options.config.maxOutputTokens, 2048) : 2048
            });
            console.log(`[Gemini Routing Fallback] OpenRouter model ${modelId} succeeded!`);
            return { text: res.choices[0]?.message?.content || "" };
          } else {
            const stream = await client.chat.completions.create({
              model: modelId,
              messages: chatMessages,
              temperature: options.config?.temperature ?? 0.7,
              max_tokens: options.config?.maxOutputTokens ? Math.min(options.config.maxOutputTokens, 2048) : 2048,
              stream: true
            });
            console.log(`[Gemini Routing Fallback] OpenRouter stream for model ${modelId} started!`);
            
            // Return stream generator
            return (async function*() {
              for await (const chunk of stream) {
                if (chunk.choices[0]?.delta?.content) {
                  yield { text: chunk.choices[0].delta.content };
                }
              }
            })();
          }
        } catch (orErr: any) {
          console.error(`[Gemini Routing Fallback] OpenRouter model ${modelId} failed:`, orErr.message || orErr);
          lastError = orErr;
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
